from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hashlib
import hmac
import re
import logging
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
from content_data import (
    PRODUCTS,
    PRODUCTS_BY_ID,
    get_product,
    SEED_AGENCIES,
    SEED_RESTAURANTS,
    SEED_RENTCARS,
    SEED_EMERGENCIES,
    SEED_SONG,
    SEED_SONGS,
)


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
    return {"message": "Descubre Rapa Nui API"}

# ---------------- Rutas Rapa Nui (contenido GPS del producto Rutas) ----------------

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


# ---------------- Catálogo de productos ----------------

@api_router.get("/products")
async def list_products():
    return {"products": PRODUCTS}


@api_router.get("/products/{product_id}")
async def get_product_endpoint(product_id: str):
    p = get_product(product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return p


# ---------------- Contenidos editables ----------------

CONTENT_COLLECTIONS = {
    "agencies": "content_agencies",
    "restaurants": "content_restaurants",
    "rentcars": "content_rentcars",
    "emergencies": "content_emergencies",
    "songs": "content_songs",
}


@api_router.get("/content/{name}")
async def list_content(name: str):
    coll = CONTENT_COLLECTIONS.get(name)
    if not coll:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    items = await db[coll].find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"collection": name, "items": items}


@api_router.get("/content/song/current")
async def get_song():
    # Retro-compat: devuelve la primera canción del catálogo.
    doc = await db.content_songs.find_one({}, {"_id": 0}, sort=[("name", 1)])
    if not doc:
        # fallback al doc antiguo o al seed
        legacy = await db.content_song.find_one({"id": "main"}, {"_id": 0})
        if legacy:
            return legacy
        return {**SEED_SONG}
    return {
        "id": doc.get("id", "main"),
        "title": doc.get("name") or doc.get("title", ""),
        "artist": doc.get("artist", ""),
        "spotify_url": doc.get("spotify_url", ""),
        "description": doc.get("description", ""),
    }


@api_router.get("/content/songs")
async def list_songs():
    """Lista pública de todas las canciones del catálogo."""
    items = await db.content_songs.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"items": items}


# ---------------- Pagos multi-producto (Stripe + Mercado Pago + Flow) ----------------

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
MP_ACCESS_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
FLOW_API_KEY = os.environ.get("FLOW_API_KEY", "")
FLOW_SECRET_KEY = os.environ.get("FLOW_SECRET_KEY", "")
FLOW_API_URL = os.environ.get("FLOW_API_URL", "https://www.flow.cl/api").rstrip("/")

logger = logging.getLogger(__name__)


class CheckoutRequest(BaseModel):
    device_id: str
    origin_url: str
    provider: str = "mercadopago"  # stripe | mercadopago | flow
    email: str | None = None
    product_id: str


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
    async with httpx.AsyncClient(timeout=20.0) as c:
        if method == "get":
            resp = await c.get(f"{FLOW_API_URL}/{service}", params=params)
        else:
            resp = await c.post(f"{FLOW_API_URL}/{service}", data=params)
    resp.raise_for_status()
    return resp.json()


async def _mp_get(path: str, params: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}"}
    async with httpx.AsyncClient(timeout=20.0) as c:
        resp = await c.get(f"https://api.mercadopago.com{path}", params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


@api_router.get("/payments/providers")
async def payment_providers():
    return {
        "stripe": bool(STRIPE_API_KEY),
        "mercadopago": bool(MP_ACCESS_TOKEN),
        "flow": bool(FLOW_API_KEY and FLOW_SECRET_KEY),
    }


@api_router.post("/payments/checkout")
async def create_payment_checkout(body: CheckoutRequest, request: Request):
    product = get_product(body.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.get("always_free"):
        raise HTTPException(status_code=400, detail="Este producto es gratuito y no requiere pago")

    email = (body.email or "").strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Se requiere un email válido para respaldar tu compra")

    origin = body.origin_url.rstrip("/")
    host_url = str(request.base_url).rstrip("/")
    tx_id = str(uuid.uuid4())
    amount = int(product["amount_clp"])

    doc = {
        "id": tx_id,
        "provider": body.provider,
        "device_id": body.device_id,
        "email": email,
        "product_id": product["id"],
        "product_name": product["name"],
        "origin_url": origin,
        "amount_clp": amount,
        "currency": "clp",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if body.provider == "stripe":
        stripe_checkout = _stripe(request)
        try:
            session = await stripe_checkout.create_checkout_session(
                CheckoutSessionRequest(
                    amount=float(amount) / 100.0,  # librería multiplica *100 -> CLP entero
                    currency="clp",
                    success_url=f"{origin}/payment-success?tx={tx_id}",
                    cancel_url=f"{origin}/",
                    metadata={"device_id": body.device_id, "tx_id": tx_id, "product_id": product["id"]},
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
                "title": product["name"],
                "description": product["description"][:200],
                "quantity": 1,
                "unit_price": amount,
                "currency_id": "CLP",
            }],
            "back_urls": {
                "success": f"{origin}/payment-success?tx={tx_id}",
                "failure": f"{origin}/",
                "pending": f"{origin}/payment-success?tx={tx_id}",
            },
            "auto_return": "approved",
            "notification_url": f"{host_url}/api/webhook/mercadopago",
            "metadata": {"device_id": body.device_id, "tx_id": tx_id, "product_id": product["id"]},
            "statement_descriptor": "DESCUBRE RAPA NUI",
        }
        headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as c:
                resp = await c.post(
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
            "subject": product["name"][:80],
            "currency": "CLP",
            "amount": amount,
            "email": email,
            "urlConfirmation": f"{host_url}/api/webhook/flow",
            # urlReturn debe apuntar al FRONTEND, no al backend.
            # Flow redirige al usuario aquí tras completar el pago; algunos hostings
            # bloquean POSTs externos a /api/*, y el detour vía backend causaba 403.
            "urlReturn": f"{origin}/payment-success?tx={tx_id}",
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
    return {"url": url, "tx_id": tx_id, "session_id": doc["session_id"], "product_id": product["id"]}


async def _grant_access(device_id: str, product_id: str, email: str, source: str, tx_id: str | None = None):
    """Asegura una entrada en access_grants: (device_id, product_id)."""
    await db.access_grants.update_one(
        {"device_id": device_id, "product_id": product_id},
        {"$set": {
            "device_id": device_id,
            "product_id": product_id,
            "email": email,
            "source": source,  # payment | manual | webhook
            "source_tx": tx_id,
            "granted_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


async def _mark_paid(query: dict):
    """Marca transacción como pagada y crea el access_grant correspondiente."""
    doc = await db.payment_transactions.find_one(query)
    if not doc or doc.get("payment_status") == "paid":
        return
    await db.payment_transactions.update_one(
        {"id": doc["id"]},
        {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
    )
    product_id = doc.get("product_id")
    if product_id:
        await _grant_access(
            device_id=doc["device_id"],
            product_id=product_id,
            email=doc.get("email", ""),
            source="payment",
            tx_id=doc["id"],
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
        return {"status": "complete", "payment_status": "paid", "product_id": doc.get("product_id")}
    try:
        result = await _resolve_status(doc, request)
        result["product_id"] = doc.get("product_id")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status error ({doc.get('provider')}): {e}")
        raise HTTPException(status_code=502, detail="No se pudo verificar el pago")


@api_router.get("/payments/access/{device_id}")
async def check_access(device_id: str):
    """Devuelve la lista de product_ids desbloqueados para el dispositivo."""
    grants = await db.access_grants.find({"device_id": device_id}, {"_id": 0}).to_list(500)
    product_ids = list({g["product_id"] for g in grants if g.get("product_id")})
    # Emergencias siempre gratis
    if "emergencies" not in product_ids:
        product_ids.append("emergencies")
    return {"unlocked": product_ids}


class SelfDestructRequest(BaseModel):
    device_id: str
    email: str | None = None


@api_router.post("/access/self-destruct")
async def self_destruct(body: SelfDestructRequest):
    """
    Auto-eliminación de acceso tras intento no autorizado al panel admin.

    IMPORTANTE (blindaje):
      - Solo borra datos vinculados EXACTAMENTE al `device_id` que llama.
      - NUNCA borra por email (para no afectar otros dispositivos del mismo
        cliente ni a otros clientes con emails similares).
      - Si el `device_id` está registrado en `admin_settings.owner_device_ids`
        (dispositivo maestro del dueño), se rechaza la operación → así el
        propio dueño no puede "quemarse" la app por error.
    """
    device_id = body.device_id.strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id requerido")

    # Blindaje: dispositivo maestro del dueño no se autodestruye
    settings_doc = await db.admin_settings.find_one({"id": "main"}) or {}
    owner_devices = set(settings_doc.get("owner_device_ids") or [])
    if device_id in owner_devices:
        logger.warning(f"SELF-DESTRUCT ignorado: device {device_id} es dueño.")
        return {
            "destroyed": False,
            "reason": "owner_device",
            "transactions_deleted": 0,
            "grants_deleted": 0,
        }

    # Solo por device_id — jamás por email
    tx_deleted = await db.payment_transactions.delete_many({"device_id": device_id})
    grants_deleted = await db.access_grants.delete_many({"device_id": device_id})

    logger.warning(
        f"SELF-DESTRUCT ejecutado. device={device_id} "
        f"tx_borradas={tx_deleted.deleted_count} grants_borrados={grants_deleted.deleted_count}"
    )

    return {
        "destroyed": True,
        "transactions_deleted": tx_deleted.deleted_count,
        "grants_deleted": grants_deleted.deleted_count,
    }




class RestoreRequest(BaseModel):
    email: str
    device_id: str


@api_router.post("/payments/restore")
async def restore_by_email(body: RestoreRequest):
    """Verifica acceso mediante el email de compra y lo vincula al device_id actual."""
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")

    unlocked: set[str] = set()
    # 1) Buscar transacciones pagadas por este email
    async for tx in db.payment_transactions.find({"email": email, "payment_status": "paid"}):
        pid = tx.get("product_id")
        if pid:
            unlocked.add(pid)
            await _grant_access(body.device_id, pid, email, "payment", tx["id"])
    # 2) Buscar grants manuales asignados a este email
    async for g in db.access_grants.find({"email": email, "source": "manual"}):
        pid = g.get("product_id")
        if pid:
            unlocked.add(pid)
            await _grant_access(body.device_id, pid, email, "manual", g.get("source_tx"))

    unlocked.add("emergencies")
    return {"has_access": len(unlocked) > 1, "unlocked": sorted(unlocked)}


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


# ---------------- Panel del Dueño ----------------
DEFAULT_ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


async def _current_admin_key() -> str:
    doc = await db.admin_settings.find_one({"id": "main"})
    if doc and doc.get("admin_key"):
        return doc["admin_key"]
    return DEFAULT_ADMIN_KEY


async def _check_admin(request: Request):
    """Verifica la clave de admin. La clave del env (DEFAULT_ADMIN_KEY) SIEMPRE
    funciona como clave maestra de recuperación, incluso si el dueño cambió su
    clave desde Seguridad y la olvidó. Además acepta la clave actualmente
    guardada en admin_settings.
    """
    key = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    if not key:
        raise HTTPException(status_code=401, detail="Clave de administrador incorrecta")

    # Recolectar todas las claves válidas
    valid_keys: set[str] = set()
    if DEFAULT_ADMIN_KEY:
        valid_keys.add(DEFAULT_ADMIN_KEY)
    doc = await db.admin_settings.find_one({"id": "main"})
    if doc and doc.get("admin_key"):
        valid_keys.add(doc["admin_key"])

    if not valid_keys or key not in valid_keys:
        raise HTTPException(status_code=401, detail="Clave de administrador incorrecta")


@api_router.get("/admin/sales")
async def admin_sales(request: Request):
    await _check_admin(request)

    paid = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"provider": 1, "amount_clp": 1, "paid_at": 1, "device_id": 1, "email": 1, "product_id": 1, "product_name": 1},
    ).sort("paid_at", -1).to_list(500)

    by_provider: dict = {}
    by_product: dict = {}
    total = 0
    for p in paid:
        total += p.get("amount_clp", 0)
        prov = p.get("provider", "stripe")
        by_provider.setdefault(prov, {"count": 0, "total_clp": 0})
        by_provider[prov]["count"] += 1
        by_provider[prov]["total_clp"] += p.get("amount_clp", 0)
        pid = p.get("product_id", "?")
        by_product.setdefault(pid, {"count": 0, "total_clp": 0, "name": p.get("product_name", pid)})
        by_product[pid]["count"] += 1
        by_product[pid]["total_clp"] += p.get("amount_clp", 0)

    pending_count = await db.payment_transactions.count_documents({"payment_status": "pending"})
    manual_grants_count = await db.access_grants.count_documents({"source": "manual"})

    return {
        "total_clp": total,
        "sales_count": len(paid),
        "pending_count": pending_count,
        "granted_count": manual_grants_count,
        "manual_grants_count": manual_grants_count,
        "by_provider": by_provider,
        "by_product": by_product,
        "recent": [
            {
                "provider": p.get("provider", "stripe"),
                "amount_clp": p.get("amount_clp", 0),
                "paid_at": p.get("paid_at"),
                "email": p.get("email", ""),
                "product_id": p.get("product_id"),
                "product_name": p.get("product_name"),
            }
            for p in paid[:30]
        ],
    }


class DeleteSalesRequest(BaseModel):
    confirm: str


@api_router.post("/admin/sales/reset")
async def admin_reset_sales(body: DeleteSalesRequest, request: Request):
    await _check_admin(request)
    if body.confirm != "BORRAR":
        raise HTTPException(status_code=400, detail="Confirmación inválida")
    # borrar transacciones y accesos NO manuales
    tx_result = await db.payment_transactions.delete_many({})
    grants_result = await db.access_grants.delete_many({"source": {"$ne": "manual"}})
    return {"transactions_deleted": tx_result.deleted_count, "grants_deleted": grants_result.deleted_count}


# --- Acceso manual (multi-producto) ---
class ManualAccessRequest(BaseModel):
    email: str
    product_ids: list[str]
    note: str | None = None
    bind_device_id: str | None = None  # si viene, aplica el acceso también a ese device (uso inmediato)


@api_router.post("/admin/manual-access")
async def admin_grant_manual_access(body: ManualAccessRequest, request: Request):
    await _check_admin(request)
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")
    if not body.product_ids:
        raise HTTPException(status_code=400, detail="Elige al menos 1 producto")

    device_key = f"manual:{email}"
    bind_device = (body.bind_device_id or "").strip() or None
    now = datetime.now(timezone.utc).isoformat()
    granted = []
    for pid in body.product_ids:
        p = get_product(pid)
        if not p or p.get("always_free"):
            continue
        # Grant "por email" (fuente de verdad para restore)
        await db.access_grants.update_one(
            {"device_id": device_key, "product_id": pid},
            {"$set": {
                "device_id": device_key,
                "product_id": pid,
                "email": email,
                "source": "manual",
                "note": body.note or "",
                "granted_at": now,
            }},
            upsert=True,
        )
        # Grant adicional aplicado al dispositivo indicado (uso inmediato sin restore)
        if bind_device:
            await db.access_grants.update_one(
                {"device_id": bind_device, "product_id": pid},
                {"$set": {
                    "device_id": bind_device,
                    "product_id": pid,
                    "email": email,
                    "source": "manual-direct",
                    "note": body.note or "",
                    "granted_at": now,
                }},
                upsert=True,
            )
        granted.append(pid)
    return {"granted": granted, "email": email, "bound_to_device": bool(bind_device)}


class RevokeAccessRequest(BaseModel):
    email: str


@api_router.post("/admin/manual-access/revoke")
async def admin_revoke_manual_access(body: RevokeAccessRequest, request: Request):
    await _check_admin(request)
    email = body.email.strip().lower()
    result = await db.access_grants.delete_many({"email": email, "source": "manual"})
    return {"deleted": result.deleted_count, "email": email}


@api_router.get("/admin/manual-access")
async def admin_list_manual_access(request: Request):
    await _check_admin(request)
    # Sólo considerar los grants "fuente de verdad" (device_id que empieza con
    # "manual:<email>") para evitar contar duplicados cuando el cliente ya hizo
    # restore o cuando se aplicó también al dispositivo del dueño.
    grants = await db.access_grants.find(
        {"source": "manual", "device_id": {"$regex": "^manual:"}},
        {"_id": 0},
    ).sort("granted_at", -1).to_list(500)
    # agrupar por email (deduplicando productos)
    by_email: dict = {}
    for g in grants:
        e = g.get("email", "")
        entry = by_email.setdefault(
            e,
            {"email": e, "products": [], "note": g.get("note", ""), "granted_at": g.get("granted_at")},
        )
        pid = g.get("product_id")
        if pid and pid not in entry["products"]:
            entry["products"].append(pid)
        # conservar la fecha más reciente
        if g.get("granted_at") and (not entry["granted_at"] or g["granted_at"] > entry["granted_at"]):
            entry["granted_at"] = g["granted_at"]
    items = sorted(by_email.values(), key=lambda x: x.get("granted_at") or "", reverse=True)
    return {"items": items, "total": len(items)}


# --- Rutas (read-only para admin) ---
@api_router.get("/admin/routes")
async def admin_list_routes(request: Request):
    await _check_admin(request)
    return [
        {
            "id": r["id"], "name": r["name"], "type": r["type"],
            "distance_km": r["distance_km"], "duration_min": r["duration_min"],
            "difficulty": r["difficulty"], "pois_count": len(r.get("pois", [])),
        } for r in ROUTES
    ]


# --- Canción (upsert) - DEBE ir antes de las rutas genéricas de contenido ---
class SongIn(BaseModel):
    title: str
    artist: str | None = None
    spotify_url: str
    description: str | None = None


@api_router.get("/admin/content/song/current")
async def admin_get_song(request: Request):
    await _check_admin(request)
    return await get_song()


@api_router.post("/admin/content/song")
async def admin_upsert_song(body: SongIn, request: Request):
    await _check_admin(request)
    doc = {"id": "main", **body.dict(exclude_none=True)}
    await db.content_song.update_one({"id": "main"}, {"$set": doc}, upsert=True)
    return doc


# --- CRUD de contenidos editables ---
class ContentItem(BaseModel):
    name: str
    phone: str | None = None
    whatsapp: str | None = None
    website: str | None = None
    address: str | None = None
    description: str | None = None
    category: str | None = None
    cuisine: str | None = None
    artist: str | None = None
    spotify_url: str | None = None


@api_router.get("/admin/content/{name}")
async def admin_list_content(name: str, request: Request):
    await _check_admin(request)
    coll = CONTENT_COLLECTIONS.get(name)
    if not coll:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    items = await db[coll].find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"items": items}


@api_router.post("/admin/content/{name}")
async def admin_create_content(name: str, body: ContentItem, request: Request):
    await _check_admin(request)
    coll = CONTENT_COLLECTIONS.get(name)
    if not coll:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    doc = {"id": str(uuid.uuid4()), **body.dict(exclude_none=True)}
    await db[coll].insert_one({**doc})
    return doc


@api_router.put("/admin/content/{name}/{item_id}")
async def admin_update_content(name: str, item_id: str, body: ContentItem, request: Request):
    await _check_admin(request)
    coll = CONTENT_COLLECTIONS.get(name)
    if not coll:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    result = await db[coll].update_one({"id": item_id}, {"$set": body.dict(exclude_none=True)})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    return await db[coll].find_one({"id": item_id}, {"_id": 0})


@api_router.delete("/admin/content/{name}/{item_id}")
async def admin_delete_content(name: str, item_id: str, request: Request):
    await _check_admin(request)
    coll = CONTENT_COLLECTIONS.get(name)
    if not coll:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    result = await db[coll].delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    return {"deleted": True}


# --- Cambio de clave admin ---
class ChangeAdminKeyRequest(BaseModel):
    current: str
    new_key: str


@api_router.post("/admin/change-password")
async def admin_change_password(body: ChangeAdminKeyRequest, request: Request):
    await _check_admin(request)
    current = await _current_admin_key()
    if body.current != current:
        raise HTTPException(status_code=401, detail="La clave actual no es correcta")
    if len(body.new_key.strip()) < 6:
        raise HTTPException(status_code=400, detail="La nueva clave debe tener al menos 6 caracteres")
    await db.admin_settings.update_one(
        {"id": "main"},
        {"$set": {"id": "main", "admin_key": body.new_key.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"changed": True}


# --- Registro de dispositivo del dueño (blindaje self-destruct) ---
class RegisterOwnerDeviceRequest(BaseModel):
    device_id: str


@api_router.post("/admin/register-device")
async def admin_register_device(body: RegisterOwnerDeviceRequest, request: Request):
    """Marca el device_id actual como dispositivo del dueño para que el
    mecanismo de autodestrucción nunca lo afecte. Solo accesible con clave admin."""
    await _check_admin(request)
    device_id = body.device_id.strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id requerido")
    await db.admin_settings.update_one(
        {"id": "main"},
        {
            "$setOnInsert": {"id": "main"},
            "$addToSet": {"owner_device_ids": device_id},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
        upsert=True,
    )
    return {"registered": True, "device_id": device_id}


@api_router.post("/admin/unregister-device")
async def admin_unregister_device(body: RegisterOwnerDeviceRequest, request: Request):
    """Elimina un device_id de la lista de dispositivos del dueño."""
    await _check_admin(request)
    device_id = body.device_id.strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id requerido")
    await db.admin_settings.update_one(
        {"id": "main"},
        {"$pull": {"owner_device_ids": device_id}},
    )
    return {"unregistered": True, "device_id": device_id}


@api_router.get("/admin/owner-devices")
async def admin_list_owner_devices(request: Request):
    await _check_admin(request)
    doc = await db.admin_settings.find_one({"id": "main"}) or {}
    return {"device_ids": doc.get("owner_device_ids") or []}


# --- Editor de Puntos Vai (compatibilidad con app original) ---
class WaterPointIn(BaseModel):
    name: str
    description: str = ""
    lat: float
    lng: float
    type: str = "tienda"


@api_router.post("/admin/water-points")
async def create_water_point(body: WaterPointIn, request: Request):
    await _check_admin(request)
    doc = {"id": str(uuid.uuid4()), "custom": True, **body.dict()}
    await db.water_points.insert_one({**doc})
    return doc


@api_router.put("/admin/water-points/{point_id}")
async def update_water_point(point_id: str, body: WaterPointIn, request: Request):
    await _check_admin(request)
    result = await db.water_points.update_one({"id": point_id}, {"$set": body.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    return await db.water_points.find_one({"id": point_id}, {"_id": 0})


@api_router.delete("/admin/water-points/{point_id}")
async def delete_water_point(point_id: str, request: Request):
    await _check_admin(request)
    result = await db.water_points.delete_one({"id": point_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    return {"deleted": True}


@api_router.get("/qr")
async def get_qr():
    return FileResponse(
        ROOT_DIR / "static" / "qr-descubre-rapa-nui.png",
        media_type="image/png",
        filename="qr-descubre-rapa-nui.png",
    )


@api_router.get("/qr-definitivo")
async def get_qr_definitivo():
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def _seed_collection(coll: str, items: list):
    if await db[coll].count_documents({}) == 0:
        docs = [{"id": str(uuid.uuid4()), **i} for i in items]
        if docs:
            await db[coll].insert_many(docs)


@app.on_event("startup")
async def seed_all():
    if await db.water_points.count_documents({}) == 0:
        await db.water_points.insert_many([{**w} for w in WATER_POINTS])
    await _seed_collection("content_agencies", SEED_AGENCIES)
    await _seed_collection("content_restaurants", SEED_RESTAURANTS)
    await _seed_collection("content_rentcars", SEED_RENTCARS)
    await _seed_collection("content_emergencies", SEED_EMERGENCIES)
    await _seed_collection("content_songs", SEED_SONGS)
    # Retro-compat con la app anterior que usaba una sola canción.
    if await db.content_song.count_documents({}) == 0:
        await db.content_song.insert_one({**SEED_SONG})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
