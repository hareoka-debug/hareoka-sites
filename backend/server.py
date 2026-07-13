from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hashlib
import hmac
import re
import logging
import secrets
import httpx
from pathlib import Path
from pydantic import BaseModel
import uuid
from datetime import datetime, timezone

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from routes_data import ROUTES, WATER_POINTS


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Rutas Rapa Nui API"}

# ---------------- Rutas Rapa Nui ----------------

@api_router.get("/routes")
async def list_routes(type: str | None = None):
    if type in ("urbana", "rural"):
        return [r for r in ROUTES if r["type"] == type]
    return ROUTES


@api_router.get("/routes/{route_id}")
async def get_route(route_id: str):
    for r in ROUTES:
        if r["id"] == route_id:
            return r
    raise HTTPException(status_code=404, detail="Ruta no encontrada")


@api_router.get("/water-points")
async def get_water_points():
    return await db.water_points.find({}, {"_id": 0}).to_list(200)


# ---------------- Pagos (Stripe + Mercado Pago + Flow) ----------------
# Precio fijo definido en el servidor: $3.000 CLP.
# Stripe: la librería multiplica amount * 100, por lo que 30.0 -> unit_amount 3000 CLP.
PRICE_CLP_DISPLAY = 3000
PRICE_AMOUNT_FOR_STRIPE_LIB = 30.0

# ---------------- Control de acceso ----------------
# Máximo de dispositivos que pueden compartir un mismo pago (email + código).
# Ejemplo: 3 = comprador puede usar celular + tablet + notebook.
MAX_DEVICES_PER_PAYMENT = int(os.environ.get("MAX_DEVICES_PER_PAYMENT", "3"))

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
MP_ACCESS_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
FLOW_API_KEY = os.environ.get("FLOW_API_KEY", "")
FLOW_SECRET_KEY = os.environ.get("FLOW_SECRET_KEY", "")
FLOW_API_URL = os.environ.get("FLOW_API_URL", "https://www.flow.cl/api").rstrip("/")

logger = logging.getLogger(__name__)


class CheckoutRequest(BaseModel):
    device_id: str
    origin_url: str
    provider: str = "stripe"  # stripe | mercadopago | flow
    email: str | None = None  # requerido por Flow


def _stripe(request: Request) -> StripeCheckout:
    host_url = str(request.base_url).rstrip("/")
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")


def _flow_sign(params: dict) -> str:
    items = sorted((k, v) for k, v in params.items() if k != "s")
    message = "".join(f"{k}{v}" for k, v in items)
    return hmac.new(FLOW_SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()


async def _flow_call(service: str, params: dict, method: str = "post") -> dict:
    params = {**params, "apiKey": FLOW_API_KEY}
    params["s"] = _flow_sign(params)
    async with httpx.AsyncClient(timeout=20.0) as client:
        if method == "get":
            resp = await client.get(f"{FLOW_API_URL}/{service}", params=params)
        else:
            resp = await client.post(f"{FLOW_API_URL}/{service}", data=params)
    resp.raise_for_status()
    return resp.json()


async def _mp_get(path: str, params: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"https://api.mercadopago.com{path}", params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


@api_router.get("/payments/providers")
async def payment_providers():
    return {
        "stripe": bool(STRIPE_API_KEY),
        "mercadopago": bool(MP_ACCESS_TOKEN),
        "flow": bool(FLOW_API_KEY and FLOW_SECRET_KEY),
        "price_clp": PRICE_CLP_DISPLAY,
    }


@api_router.post("/payments/checkout")
async def create_payment_checkout(body: CheckoutRequest, request: Request):
    email = (body.email or "").strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Se requiere un email válido para respaldar tu compra")
    origin = body.origin_url.rstrip("/")
    host_url = str(request.base_url).rstrip("/")
    tx_id = str(uuid.uuid4())
    # Código de acceso único de 6 dígitos — el cliente lo verá post-pago y
    # deberá usarlo para autorizar otros dispositivos (tablet, notebook).
    access_code = f"{secrets.randbelow(1_000_000):06d}"
    doc = {
        "id": tx_id,
        "provider": body.provider,
        "device_id": body.device_id,
        "email": email,
        "origin_url": origin,
        "amount_clp": PRICE_CLP_DISPLAY,
        "currency": "clp",
        "payment_status": "pending",
        "access_code": access_code,
        "max_devices": MAX_DEVICES_PER_PAYMENT,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if body.provider == "stripe":
        stripe_checkout = _stripe(request)
        try:
            session = await stripe_checkout.create_checkout_session(
                CheckoutSessionRequest(
                    amount=PRICE_AMOUNT_FOR_STRIPE_LIB,
                    currency="clp",
                    success_url=f"{origin}/payment-success?tx={tx_id}",
                    cancel_url=f"{origin}/",
                    metadata={"device_id": body.device_id, "tx_id": tx_id},
                )
            )
        except Exception as e:
            logger.error(f"Stripe checkout error: {e}")
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Stripe")
        doc["session_id"] = session.session_id
        url = session.url

    elif body.provider == "mercadopago":
        if not MP_ACCESS_TOKEN:
            raise HTTPException(status_code=503, detail="Mercado Pago no está configurado aún")
        payload = {
            "external_reference": tx_id,
            "items": [{
                "title": "Guía Rutas Rapa Nui",
                "description": "Acceso completo a rutas urbanas y rurales de Isla de Pascua",
                "quantity": 1,
                "unit_price": PRICE_CLP_DISPLAY,
                "currency_id": "CLP",
            }],
            "back_urls": {
                "success": f"{origin}/payment-success?tx={tx_id}",
                "failure": f"{origin}/",
                "pending": f"{origin}/payment-success?tx={tx_id}",
            },
            "auto_return": "approved",
            "notification_url": f"{host_url}/api/webhook/mercadopago",
            "metadata": {"device_id": body.device_id, "tx_id": tx_id},
            "statement_descriptor": "RUTAS RAPA NUI",
        }
        headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.mercadopago.com/checkout/preferences", json=payload, headers=headers
                )
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"Mercado Pago error: {e}")
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Mercado Pago")
        pref = resp.json()
        doc["session_id"] = pref.get("id")
        url = pref.get("init_point")

    elif body.provider == "flow":
        if not (FLOW_API_KEY and FLOW_SECRET_KEY):
            raise HTTPException(status_code=503, detail="Flow no está configurado aún")
        params = {
            "commerceOrder": tx_id,
            "subject": "Guía Rutas Rapa Nui",
            "currency": "CLP",
            "amount": PRICE_CLP_DISPLAY,
            "email": email,
            "urlConfirmation": f"{host_url}/api/webhook/flow",
            "urlReturn": f"{host_url}/api/payments/flow/return",
        }
        try:
            result = await _flow_call("payment/create", params)
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("message", "")
            except Exception:
                pass
            logger.error(f"Flow error: {e} {detail}")
            if "email" in detail.lower():
                raise HTTPException(
                    status_code=400,
                    detail="El email ingresado no es válido para Flow. Usa un correo real.",
                )
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Flow")
        except Exception as e:
            logger.error(f"Flow error: {e}")
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Flow")
        flow_token = result.get("token")
        doc["session_id"] = flow_token
        url = f"{result.get('url')}?token={flow_token}"

    else:
        raise HTTPException(status_code=400, detail="Proveedor de pago inválido")

    await db.payment_transactions.insert_one(doc)
    return {"url": url, "tx_id": tx_id, "session_id": doc["session_id"]}


async def _mark_paid(query: dict):
    await db.payment_transactions.update_one(
        {**query, "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
    )


async def _resolve_status(doc: dict, request: Request) -> dict:
    provider = doc.get("provider", "stripe")
    session_id = doc.get("session_id")

    if provider == "stripe":
        stripe_checkout = _stripe(request)
        st = await stripe_checkout.get_checkout_status(session_id)
        if st.payment_status == "paid":
            await _mark_paid({"id": doc["id"]})
        elif st.status == "expired" and doc.get("payment_status") == "pending":
            await db.payment_transactions.update_one(
                {"id": doc["id"]}, {"$set": {"payment_status": "expired"}}
            )
        return {"status": st.status, "payment_status": st.payment_status}

    if provider == "mercadopago":
        data = await _mp_get("/v1/payments/search", {"external_reference": doc["id"]})
        results = data.get("results", [])
        statuses = [r.get("status") for r in results]
        if "approved" in statuses:
            await _mark_paid({"id": doc["id"]})
            return {"status": "complete", "payment_status": "paid"}
        if statuses and all(s in ("rejected", "cancelled") for s in statuses):
            return {"status": "open", "payment_status": "rejected"}
        return {"status": "open", "payment_status": "unpaid"}

    if provider == "flow":
        st = await _flow_call("payment/getStatus", {"token": session_id}, method="get")
        flow_status = st.get("status")  # 1=pendiente, 2=pagada, 3=rechazada, 4=anulada
        if flow_status == 2:
            await _mark_paid({"id": doc["id"]})
            return {"status": "complete", "payment_status": "paid"}
        if flow_status in (3, 4):
            return {"status": "expired" if flow_status == 4 else "open", "payment_status": "rejected"}
        return {"status": "open", "payment_status": "unpaid"}

    raise HTTPException(status_code=400, detail="Proveedor desconocido")


@api_router.get("/payments/status/{tx_id}")
async def get_payment_status(tx_id: str, request: Request):
    doc = await db.payment_transactions.find_one({"$or": [{"id": tx_id}, {"session_id": tx_id}]})
    if not doc:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if doc.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid"}
    try:
        return await _resolve_status(doc, request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status error ({doc.get('provider')}): {e}")
        raise HTTPException(status_code=502, detail="No se pudo verificar el pago")


@api_router.get("/payments/access/{device_id}")
async def check_access(device_id: str):
    """Verifica si un device_id tiene acceso: fue el dispositivo comprador
    o tiene un access_grant válido asociado a una compra pagada."""
    paid = await db.payment_transactions.find_one(
        {"device_id": device_id, "payment_status": "paid"}
    )
    if paid:
        return {"has_access": True, "email": paid.get("email"), "is_purchaser": True}
    grant = await db.access_grants.find_one({"device_id": device_id})
    if grant:
        # Verificamos que la transacción origen siga siendo válida (paid)
        source = await db.payment_transactions.find_one({"id": grant.get("source_tx")})
        if source and source.get("payment_status") == "paid":
            return {"has_access": True, "email": grant.get("email"), "is_purchaser": False}
    return {"has_access": False}


@api_router.get("/payments/my-info/{device_id}")
async def my_purchase_info(device_id: str):
    """Info del pago para el dispositivo comprador: email, código de acceso,
    dispositivos activos y cuántos slots quedan.
    Solo devuelve el código si device_id es el que originalmente pagó."""
    paid = await db.payment_transactions.find_one(
        {"device_id": device_id, "payment_status": "paid"}
    )
    if not paid:
        raise HTTPException(status_code=404, detail="Este dispositivo no ha comprado")

    grants = await db.access_grants.find(
        {"source_tx": paid["id"]},
        {"_id": 0, "device_id": 1, "granted_at": 1}
    ).sort("granted_at", -1).to_list(20)

    max_devices = paid.get("max_devices", MAX_DEVICES_PER_PAYMENT)
    # +1 porque el device comprador cuenta como uno
    active_count = 1 + len(grants)
    return {
        "email": paid.get("email"),
        "access_code": paid.get("access_code"),
        "max_devices": max_devices,
        "active_devices": active_count,
        "slots_remaining": max(0, max_devices - active_count),
        "purchaser_device": (paid.get("device_id") or "")[:10] + "…",
        "extra_devices": [
            {
                "device_id_short": (g.get("device_id") or "")[:10] + "…",
                "device_id": g.get("device_id"),
                "granted_at": g.get("granted_at"),
            }
            for g in grants
        ],
    }


class ReleaseDeviceRequest(BaseModel):
    device_id: str  # el dispositivo comprador (autoriza la acción)
    target_device_id: str  # el device_id a liberar


@api_router.post("/payments/release-device")
async def release_device(body: ReleaseDeviceRequest):
    """El comprador libera uno de sus dispositivos extra (ej: perdió su tablet)."""
    paid = await db.payment_transactions.find_one(
        {"device_id": body.device_id, "payment_status": "paid"}
    )
    if not paid:
        raise HTTPException(status_code=403, detail="Solo el comprador puede liberar dispositivos")
    if body.target_device_id == body.device_id:
        raise HTTPException(status_code=400, detail="No puedes liberar el dispositivo comprador")
    result = await db.access_grants.delete_one({
        "device_id": body.target_device_id,
        "source_tx": paid["id"],
    })
    return {"released": result.deleted_count > 0}


class RestoreRequest(BaseModel):
    email: str
    device_id: str
    access_code: str | None = None  # requerido para restaurar en otros dispositivos


@api_router.post("/payments/restore")
async def restore_by_email(body: RestoreRequest):
    """Vincula el dispositivo a una compra existente.
    Requiere: email + código de acceso (6 dígitos que el cliente vio al pagar).
    Enforza el máximo de dispositivos por compra."""
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")

    # ¿Este dispositivo ya es el comprador original? Entonces acceso directo.
    purchaser = await db.payment_transactions.find_one(
        {"device_id": body.device_id, "email": email, "payment_status": "paid"}
    )
    if purchaser:
        return {"has_access": True, "reason": "purchaser"}

    # ¿Este dispositivo ya tiene grant activo con este email? Entonces acceso directo.
    existing_grant = await db.access_grants.find_one(
        {"device_id": body.device_id, "email": email}
    )
    if existing_grant:
        return {"has_access": True, "reason": "already_granted"}

    # Buscar la compra por email
    paid = await db.payment_transactions.find_one({"email": email, "payment_status": "paid"})
    if not paid:
        return {"has_access": False, "reason": "no_payment"}

    # Grants manuales (sin código): el admin concedió acceso, permitir sin código
    is_manual = paid.get("provider") == "manual"

    # Verificar código de acceso (excepto grants manuales)
    if not is_manual:
        expected_code = str(paid.get("access_code") or "").strip()
        given_code = (body.access_code or "").strip()
        if not expected_code:
            # Compra vieja sin código — dejamos entrar por email (compatibilidad)
            pass
        elif given_code != expected_code:
            return {"has_access": False, "reason": "code_invalid"}

    # Enforzar límite de dispositivos
    max_devices = paid.get("max_devices", MAX_DEVICES_PER_PAYMENT)
    current_grants = await db.access_grants.count_documents({"source_tx": paid["id"]})
    active_devices = 1 + current_grants  # +1 por el comprador
    if active_devices >= max_devices:
        return {
            "has_access": False,
            "reason": "device_limit",
            "max_devices": max_devices,
            "active_devices": active_devices,
        }

    # Crear el grant
    await db.access_grants.update_one(
        {"device_id": body.device_id},
        {"$set": {
            "device_id": body.device_id,
            "email": email,
            "source_tx": paid["id"],
            "granted_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {
        "has_access": True,
        "reason": "granted",
        "slots_remaining": max_devices - active_devices - 1,
    }


# --- Retorno de Flow (Flow redirige al pagador vía POST con el token) ---
@api_router.api_route("/payments/flow/return", methods=["GET", "POST"])
async def flow_return(request: Request):
    token = request.query_params.get("token")
    if not token and request.method == "POST":
        try:
            form = await request.form()
            token = form.get("token")
        except Exception:
            token = None
    doc = await db.payment_transactions.find_one({"session_id": token}) if token else None
    if doc:
        return RedirectResponse(
            url=f"{doc['origin_url']}/payment-success?tx={doc['id']}", status_code=303
        )
    return RedirectResponse(url="/", status_code=303)


# ---------------- Webhooks ----------------
@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    stripe_checkout = _stripe(request)
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        if webhook_response.payment_status == "paid":
            await _mark_paid({"session_id": webhook_response.session_id})
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook Stripe error: {e}")
        raise HTTPException(status_code=400, detail="Webhook inválido")


@api_router.post("/webhook/mercadopago")
async def mercadopago_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"received": True}
    if body.get("type") == "payment" and body.get("data", {}).get("id"):
        try:
            payment = await _mp_get(f"/v1/payments/{body['data']['id']}")
            if payment.get("status") == "approved" and payment.get("external_reference"):
                await _mark_paid({"id": payment["external_reference"]})
        except Exception as e:
            logger.error(f"Webhook MP error: {e}")
    return {"received": True}


@api_router.post("/webhook/flow")
async def flow_webhook(request: Request):
    try:
        form = await request.form()
        token = form.get("token")
    except Exception:
        token = None
    if token:
        try:
            st = await _flow_call("payment/getStatus", {"token": token}, method="get")
            if st.get("status") == 2:
                await _mark_paid({"session_id": token})
        except Exception as e:
            logger.error(f"Webhook Flow error: {e}")
    return {"received": True}


# ---------------- Panel de ventas (solo dueño) ----------------
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _check_admin(request: Request):
    key = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Clave de administrador incorrecta")


@api_router.get("/admin/sales")
async def admin_sales(request: Request):
    _check_admin(request)

    paid = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"provider": 1, "amount_clp": 1, "paid_at": 1, "device_id": 1, "email": 1, "id": 1},
    ).sort("paid_at", -1).to_list(500)

    by_provider: dict = {}
    total = 0
    for p in paid:
        total += p.get("amount_clp", 0)
        prov = p.get("provider", "stripe")
        by_provider.setdefault(prov, {"count": 0, "total_clp": 0})
        by_provider[prov]["count"] += 1
        by_provider[prov]["total_clp"] += p.get("amount_clp", 0)

    pending_count = await db.payment_transactions.count_documents({"payment_status": "pending"})
    granted_count = await db.access_grants.count_documents({})

    return {
        "total_clp": total,
        "sales_count": len(paid),
        "pending_count": pending_count,
        "granted_count": granted_count,
        "by_provider": by_provider,
        "recent": [
            {
                "id": p.get("id"),
                "email": p.get("email"),
                "provider": p.get("provider", "stripe"),
                "amount_clp": p.get("amount_clp", 0),
                "paid_at": p.get("paid_at"),
                "device_id": (p.get("device_id") or "")[:14],
            }
            for p in paid[:30]
        ],
    }


# --- Panel de recuperación / concesión manual de acceso ---
# Casos de uso:
#  - Un cliente pagó por Mercado Pago / Flow pero el webhook no confirmó a tiempo.
#  - Cambio de dispositivo, cliente perdió acceso.
#  - Emergencia por pérdida de BD entre deploys (recuperar acceso a compradores).

@api_router.get("/admin/transactions")
async def admin_transactions(request: Request, email: str | None = None, status: str | None = None, limit: int = 100):
    """Lista transacciones con TODOS los estados (pending/paid/rejected/expired).
    Filtros opcionales: ?email=xxx@yyy.com  ?status=paid  ?limit=50"""
    _check_admin(request)
    query: dict = {}
    if email:
        query["email"] = email.strip().lower()
    if status:
        query["payment_status"] = status
    docs = await db.payment_transactions.find(
        query,
        {"_id": 0, "id": 1, "email": 1, "provider": 1, "payment_status": 1,
         "amount_clp": 1, "created_at": 1, "paid_at": 1, "device_id": 1, "session_id": 1},
    ).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    return {"count": len(docs), "items": docs}


class GrantRequest(BaseModel):
    email: str
    note: str | None = None  # ej: "Pagó con Flow, comprobante #12345"


@api_router.post("/admin/grant")
async def admin_grant(body: GrantRequest, request: Request):
    """Concede acceso manualmente a un email que ya pagó (útil si la BD perdió
    el registro o el webhook nunca confirmó). El cliente luego usa
    "Restaurar acceso con tu email" en la app y entra."""
    _check_admin(request)
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")

    # ¿Ya tiene una transacción paid? No dupliquemos.
    existing = await db.payment_transactions.find_one({"email": email, "payment_status": "paid"})
    if existing:
        return {"granted": True, "already_had_access": True, "tx_id": existing["id"], "access_code": existing.get("access_code")}

    now = datetime.now(timezone.utc).isoformat()
    tx_id = str(uuid.uuid4())
    access_code = f"{secrets.randbelow(1_000_000):06d}"
    await db.payment_transactions.insert_one({
        "id": tx_id,
        "provider": "manual",
        "device_id": "",
        "email": email,
        "origin_url": "",
        "amount_clp": PRICE_CLP_DISPLAY,
        "currency": "clp",
        "payment_status": "paid",
        "access_code": access_code,
        "max_devices": MAX_DEVICES_PER_PAYMENT,
        "created_at": now,
        "paid_at": now,
        "manual_note": body.note or "",
    })
    return {"granted": True, "already_had_access": False, "tx_id": tx_id, "email": email, "access_code": access_code}


class BulkGrantRequest(BaseModel):
    emails: list[str]
    note: str | None = None


@api_router.post("/admin/grant-bulk")
async def admin_grant_bulk(body: BulkGrantRequest, request: Request):
    """Concede acceso a múltiples emails a la vez (útil para restaurar
    compradores luego de una pérdida de BD)."""
    _check_admin(request)
    results = []
    for raw in body.emails:
        email = raw.strip().lower()
        if not re.match(r"^\S+@\S+\.\S+$", email):
            results.append({"email": raw, "granted": False, "error": "email_invalid"})
            continue
        existing = await db.payment_transactions.find_one({"email": email, "payment_status": "paid"})
        if existing:
            results.append({"email": email, "granted": True, "already": True, "access_code": existing.get("access_code")})
            continue
        now = datetime.now(timezone.utc).isoformat()
        tx_id = str(uuid.uuid4())
        access_code = f"{secrets.randbelow(1_000_000):06d}"
        await db.payment_transactions.insert_one({
            "id": tx_id,
            "provider": "manual",
            "device_id": "",
            "email": email,
            "origin_url": "",
            "amount_clp": PRICE_CLP_DISPLAY,
            "currency": "clp",
            "payment_status": "paid",
            "access_code": access_code,
            "max_devices": MAX_DEVICES_PER_PAYMENT,
            "created_at": now,
            "paid_at": now,
            "manual_note": body.note or "",
        })
        results.append({"email": email, "granted": True, "already": False, "access_code": access_code})
    return {"count": len(results), "results": results}


class RevokeRequest(BaseModel):
    email: str


@api_router.post("/admin/revoke")
async def admin_revoke(body: RevokeRequest, request: Request):
    """Revoca acceso manual creado por /admin/grant. NO afecta pagos reales."""
    _check_admin(request)
    email = body.email.strip().lower()
    r1 = await db.payment_transactions.delete_many({"email": email, "provider": "manual"})
    r2 = await db.access_grants.delete_many({"email": email})
    return {"revoked_transactions": r1.deleted_count, "revoked_grants": r2.deleted_count}


# --- Gestión de dispositivos activos por email/compra ---

@api_router.get("/admin/devices")
async def admin_devices(request: Request, email: str | None = None):
    """Lista dispositivos activos por compra. Si se pasa ?email=X filtra."""
    _check_admin(request)
    tx_query: dict = {"payment_status": "paid"}
    if email:
        tx_query["email"] = email.strip().lower()

    txs = await db.payment_transactions.find(
        tx_query,
        {"_id": 0, "id": 1, "email": 1, "device_id": 1, "provider": 1,
         "access_code": 1, "max_devices": 1, "paid_at": 1, "created_at": 1}
    ).sort("paid_at", -1).to_list(200)

    items = []
    for tx in txs:
        grants = await db.access_grants.find(
            {"source_tx": tx["id"]},
            {"_id": 0, "device_id": 1, "granted_at": 1}
        ).sort("granted_at", -1).to_list(20)
        items.append({
            "tx_id": tx.get("id"),
            "email": tx.get("email"),
            "provider": tx.get("provider"),
            "access_code": tx.get("access_code"),
            "max_devices": tx.get("max_devices", MAX_DEVICES_PER_PAYMENT),
            "purchaser_device": tx.get("device_id") or None,
            "extra_devices": grants,
            "active_count": (1 if tx.get("device_id") else 0) + len(grants),
            "paid_at": tx.get("paid_at") or tx.get("created_at"),
        })
    return {"count": len(items), "items": items}


class AdminReleaseRequest(BaseModel):
    tx_id: str
    device_id: str


@api_router.post("/admin/release-device")
async def admin_release_device(body: AdminReleaseRequest, request: Request):
    """Libera un dispositivo (extra o comprador) de una compra específica."""
    _check_admin(request)
    tx = await db.payment_transactions.find_one({"id": body.tx_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    # ¿Es el comprador principal?
    if tx.get("device_id") == body.device_id:
        await db.payment_transactions.update_one(
            {"id": body.tx_id}, {"$set": {"device_id": ""}}
        )
        return {"released": True, "was_purchaser": True}
    # Es un grant extra
    result = await db.access_grants.delete_one({
        "source_tx": body.tx_id,
        "device_id": body.device_id,
    })
    return {"released": result.deleted_count > 0, "was_purchaser": False}


class RegenCodeRequest(BaseModel):
    email: str


@api_router.post("/admin/regen-code")
async def admin_regen_code(body: RegenCodeRequest, request: Request):
    """Regenera el código de acceso de un email (si el cliente lo perdió)."""
    _check_admin(request)
    email = body.email.strip().lower()
    tx = await db.payment_transactions.find_one({"email": email, "payment_status": "paid"})
    if not tx:
        raise HTTPException(status_code=404, detail="No hay compra pagada para ese email")
    new_code = f"{secrets.randbelow(1_000_000):06d}"
    await db.payment_transactions.update_one(
        {"id": tx["id"]}, {"$set": {"access_code": new_code}}
    )
    return {"email": email, "access_code": new_code}


# --- Editor de Puntos Vai (dónde comprar agua VAINATIVA) ---
class WaterPointIn(BaseModel):
    name: str
    description: str = ""
    lat: float
    lng: float
    type: str = "tienda"


@api_router.post("/admin/water-points")
async def create_water_point(body: WaterPointIn, request: Request):
    _check_admin(request)
    doc = {"id": str(uuid.uuid4()), "custom": True, **body.dict()}
    await db.water_points.insert_one({**doc})
    return doc


@api_router.put("/admin/water-points/{point_id}")
async def update_water_point(point_id: str, body: WaterPointIn, request: Request):
    _check_admin(request)
    result = await db.water_points.update_one({"id": point_id}, {"$set": body.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    return await db.water_points.find_one({"id": point_id}, {"_id": 0})


@api_router.delete("/admin/water-points/{point_id}")
async def delete_water_point(point_id: str, request: Request):
    _check_admin(request)
    result = await db.water_points.delete_one({"id": point_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    return {"deleted": True}


@api_router.get("/qr")
async def get_qr():
    """Código QR oficial que apunta a la URL de producción de la app."""
    return FileResponse(
        ROOT_DIR / "static" / "qr-descubre-rapa-nui.png",
        media_type="image/png",
        filename="qr-descubre-rapa-nui.png",
    )


@api_router.get("/qr-definitivo")
async def get_qr_definitivo():
    """QR permanente: apunta a la página oficial de la app en Emergent."""
    return FileResponse(
        ROOT_DIR / "static" / "qr-definitivo.png",
        media_type="image/png",
        filename="qr-descubre-rapa-nui-definitivo.png",
    )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Servir frontend Expo Web como estático ----------------
# El build web (`expo export --platform web`) se copia a `backend/web_static/`
# para que viaje con el deploy del backend. Servimos:
#   /                  → index.html (Expo Router SPA)
#   /_expo/**          → JS bundles y assets del build
#   /assets/**         → imágenes/fuentes del build
#   /favicon.ico       → favicon
#   /<ruta-cliente>    → fallback SPA a index.html (expo-router lo maneja)
_FRONTEND_DIST = ROOT_DIR / "web_static"
# Fallback por si el build vive en el frontend (dev / preview)
if not (_FRONTEND_DIST / "index.html").exists():
    _alt = Path("/app/frontend/dist")
    if (_alt / "index.html").exists():
        _FRONTEND_DIST = _alt

if _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
    logger.info(f"Serving Expo Web from {_FRONTEND_DIST}")
    # Servir el bundle JS bajo /_expo (StaticFiles maneja bien los cache headers).
    _EXPO_DIR = _FRONTEND_DIST / "_expo"
    if _EXPO_DIR.exists():
        app.mount(
            "/_expo",
            StaticFiles(directory=str(_EXPO_DIR)),
            name="expo-assets",
        )

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        return FileResponse(_FRONTEND_DIST / "favicon.ico")

    # Fallback SPA universal: sirve archivos estáticos (incl. /assets/*, fuentes,
    # imágenes) desde web_static/, y si el path no existe cae a index.html
    # para que expo-router maneje la navegación.
    # NO usamos un mount separado para /assets porque en el deploy la carpeta
    # puede no viajar correctamente; con este catchall siempre funciona.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # No interceptar rutas del API
        if full_path.startswith("api") or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Servir archivos concretos que existan en web_static/
        target = _FRONTEND_DIST / full_path
        if full_path and target.is_file():
            # Determinar tipo MIME básico para fuentes/imágenes
            ext = target.suffix.lower()
            media_type = None
            if ext == ".ttf":
                media_type = "font/ttf"
            elif ext == ".woff":
                media_type = "font/woff"
            elif ext == ".woff2":
                media_type = "font/woff2"
            elif ext == ".otf":
                media_type = "font/otf"
            return FileResponse(target, media_type=media_type)
        # Si el path incluye una extensión de archivo (fuente/imagen/js) y no existe → 404 real
        # para que el cliente sepa que el asset no está.
        if "." in full_path.split("/")[-1]:
            raise HTTPException(status_code=404, detail="Not Found")
        # Fallback a index.html (SPA)
        return FileResponse(_FRONTEND_DIST / "index.html")
else:
    logger.warning(f"Expo Web build not found at {_FRONTEND_DIST}. `/` will 404.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def seed_water_points():
    if await db.water_points.count_documents({}) == 0:
        await db.water_points.insert_many([{**w} for w in WATER_POINTS])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
