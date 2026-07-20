from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, FileResponse, Response
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
from datetime import datetime, timezone, timedelta

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from routes_data import ROUTES, WATER_POINTS


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

# ============================================================
#                    PRODUCTOS (nuevo modelo)
# ============================================================
# Cada botón del paywall = 1 producto. Un usuario puede comprar
# varios productos (cada uno se registra como una transacción
# independiente). Un producto sin `amount_clp` (0) es gratuito.

PRODUCTS = {
    "routes-3": {
        "id": "routes-3",
        "name": "3 Rutas Urbanas",
        "name_en": "3 Urban Routes",
        "short": "Hanga Roa, Costanera, Ana Kai Tangata",
        "short_en": "Hanga Roa, Coastline, Ana Kai Tangata",
        "description": "Acceso a 3 rutas urbanas fáciles: Circuito Hanga Roa, Costanera Policarpo Toro y Sendero Ana Kai Tangata.",
        "description_en": "Access to 3 easy urban routes: Hanga Roa circuit, Policarpo Toro seafront and Ana Kai Tangata trail.",
        "amount_clp": 3000,
        "kind": "routes",
        "route_ids": ["circuito-hanga-roa", "costanera-policarpo-toro", "ana-kai-tangata"],
        "emoji": "🗺️",
        "color": "#B35D4A",
    },
    "routes-all": {
        "id": "routes-all",
        "name": "Las 11 Rutas Completas",
        "name_en": "All 11 Complete Routes",
        "short": "Guía completa de senderos",
        "short_en": "Full trail guide",
        "description": "Acceso a las 11 rutas urbanas y rurales de la isla, con moáis, playas y puntos de agua Vai.",
        "description_en": "Access to all 11 urban and rural routes of the island, with moais, beaches and Vai water points.",
        "amount_clp": 5000,
        "kind": "routes",
        "route_ids": "*",
        "emoji": "🧭",
        "color": "#8B3A2E",
    },
    "agencies": {
        "id": "agencies",
        "name": "Agencias de Tour",
        "name_en": "Tour Agencies",
        "short": "Todas las agencias de la isla",
        "short_en": "All tour agencies of the island",
        "description": "Contacto directo con las agencias de tours registradas en Rapa Nui.",
        "description_en": "Direct contact with registered tour agencies in Rapa Nui.",
        "amount_clp": 3000,
        "kind": "info",
        "emoji": "🎒",
        "color": "#2E86AB",
    },
    "restaurants": {
        "id": "restaurants",
        "name": "Restaurantes",
        "name_en": "Restaurants",
        "short": "Dónde comer en Rapa Nui",
        "short_en": "Where to eat in Rapa Nui",
        "description": "Restaurantes locales y de la isla con dirección y contacto.",
        "description_en": "Local restaurants of the island with address and contact.",
        "amount_clp": 3000,
        "kind": "info",
        "emoji": "🍽️",
        "color": "#E63946",
    },
    "rentcars": {
        "id": "rentcars",
        "name": "Rent a Car",
        "name_en": "Rent a Car",
        "short": "Arriendos de vehículos",
        "short_en": "Vehicle rentals",
        "description": "Todos los rent-a-car de la isla para moverte a tu ritmo.",
        "description_en": "All rent-a-car agencies of the island to move at your own pace.",
        "amount_clp": 3000,
        "kind": "info",
        "emoji": "🚗",
        "color": "#F4A261",
    },
    "song": {
        "id": "song",
        "name": "Escucha y descubre la emoción que expresa el pasado",
        "name_en": "Listen and discover the emotion the past expresses",
        "short": "Música ancestral rapanui · Exclusivo",
        "short_en": "Ancestral Rapanui music · Exclusive",
        "description": "Sumérgete en un canto tradicional rapanui que ha viajado por generaciones. Contenido exclusivo, disponible en Spotify.",
        "description_en": "Immerse yourself in a traditional Rapanui chant that has traveled through generations. Exclusive content, available on Spotify.",
        "amount_clp": 3000,
        "kind": "media",
        "emoji": "🎵",
        "color": "#1DB954",
    },
    "emergencies": {
        "id": "emergencies",
        "name": "Emergencias",
        "name_en": "Emergencies",
        "short": "Bomberos, Hospital, PDI, Carabineros, Armada",
        "short_en": "Fire dept., Hospital, PDI, Police, Navy",
        "description": "Contactos de emergencia en la isla. Acceso siempre gratuito.",
        "description_en": "Emergency contacts on the island. Always free access.",
        "amount_clp": 0,
        "kind": "info",
        "emoji": "🚨",
        "color": "#DC2626",
    },
}

FREE_PRODUCT_IDS = {pid for pid, p in PRODUCTS.items() if p["amount_clp"] == 0}

# ============================================================
#                     CONTROL DE ACCESO
# ============================================================
# Modelo: 1 pago = 1 email = 1 dispositivo, sesión 30 días.
MAX_DEVICES_PER_PAYMENT = 1
SESSION_TTL_HOURS = int(os.environ.get("SESSION_TTL_HOURS", "720"))  # 30 días
ACCESS_CODE_LENGTH = 4

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
MP_ACCESS_TOKEN = os.environ.get("MP_ACCESS_TOKEN", "")
FLOW_API_KEY = os.environ.get("FLOW_API_KEY", "")
FLOW_SECRET_KEY = os.environ.get("FLOW_SECRET_KEY", "")
FLOW_API_URL = os.environ.get("FLOW_API_URL", "https://www.flow.cl/api").rstrip("/")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _is_session_valid(ref_iso: str | None) -> bool:
    if not ref_iso:
        return False
    try:
        ref_dt = datetime.fromisoformat(ref_iso.replace("Z", "+00:00"))
        if ref_dt.tzinfo is None:
            ref_dt = ref_dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ref_dt) < timedelta(hours=SESSION_TTL_HOURS)
    except Exception:
        return False


async def _resolve_owned_products(device_id: str) -> dict:
    """Agrega todos los productos que este dispositivo tiene desbloqueados,
    ya sea porque compró desde este device o porque fue vinculado por grant
    manual. Emergencias siempre está incluido (gratis).
    Devuelve: {owned: [...], email, has_active_session}
    """
    owned: set[str] = set(FREE_PRODUCT_IDS)
    email: str | None = None
    latest_verified: str | None = None

    # 1) Compras propias del dispositivo
    async for tx in db.payment_transactions.find(
        {"device_id": device_id, "payment_status": "paid"}
    ):
        pid = tx.get("product_id")
        if pid and pid in PRODUCTS:
            owned.add(pid)
        if not email:
            email = tx.get("email")
        ref = tx.get("last_verified_at") or tx.get("paid_at")
        if ref and (not latest_verified or ref > latest_verified):
            latest_verified = ref

    # 2) Grants: transacciones de OTROS devices vinculadas a este device
    async for grant in db.access_grants.find({"device_id": device_id}):
        src = await db.payment_transactions.find_one({"id": grant.get("source_tx")})
        if src and src.get("payment_status") == "paid":
            pid = src.get("product_id")
            if pid and pid in PRODUCTS:
                owned.add(pid)
            if not email:
                email = grant.get("email") or src.get("email")
            ref = grant.get("verified_at") or grant.get("granted_at")
            if ref and (not latest_verified or ref > latest_verified):
                latest_verified = ref

    has_paid = any(p not in FREE_PRODUCT_IDS for p in owned)
    return {
        "owned": sorted(owned),
        "email": email,
        "has_paid": has_paid,
        "session_valid": _is_session_valid(latest_verified) if has_paid else True,
    }


# ============================================================
#                        RUTAS PÚBLICAS
# ============================================================

@api_router.get("/")
async def root():
    return {"message": "Descubre Rapa Nui API"}


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


@api_router.get("/products")
async def list_products():
    """Lista todos los productos con precio y descripción para mostrar en el paywall."""
    order = ["routes-3", "routes-all", "agencies", "restaurants", "rentcars", "song", "emergencies"]
    return {
        "products": [PRODUCTS[pid] for pid in order if pid in PRODUCTS],
    }


# ============================================================
#                    HELPERS DE PAGO
# ============================================================

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


# ============================================================
#                       CHECKOUT
# ============================================================

class CheckoutRequest(BaseModel):
    device_id: str
    email: str
    product_id: str
    provider: str = "mercadopago"  # mercadopago | flow | stripe
    origin_url: str


@api_router.post("/payments/checkout")
async def create_payment_checkout(body: CheckoutRequest, request: Request):
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Se requiere un email válido")
    if body.product_id not in PRODUCTS:
        raise HTTPException(status_code=400, detail="Producto inválido")
    product = PRODUCTS[body.product_id]
    if product["amount_clp"] == 0:
        raise HTTPException(status_code=400, detail="Este contenido es gratis, no requiere pago")

    origin = body.origin_url.rstrip("/")
    host_url = str(request.base_url).rstrip("/")
    tx_id = str(uuid.uuid4())
    access_code = f"{secrets.randbelow(10 ** ACCESS_CODE_LENGTH):0{ACCESS_CODE_LENGTH}d}"

    doc = {
        "id": tx_id,
        "provider": body.provider,
        "device_id": body.device_id,
        "email": email,
        "product_id": body.product_id,
        "product_name": product["name"],
        "origin_url": origin,
        "amount_clp": product["amount_clp"],
        "currency": "clp",
        "payment_status": "pending",
        "access_code": access_code,
        "max_devices": MAX_DEVICES_PER_PAYMENT,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    title = f"Descubre Rapa Nui — {product['name']}"

    if body.provider == "stripe":
        stripe_checkout = _stripe(request)
        try:
            session = await stripe_checkout.create_checkout_session(
                CheckoutSessionRequest(
                    amount=float(product["amount_clp"]) / 100,
                    currency="clp",
                    success_url=f"{origin}/payment-success?tx={tx_id}",
                    cancel_url=f"{origin}/",
                    metadata={"device_id": body.device_id, "tx_id": tx_id, "product_id": body.product_id},
                )
            )
        except Exception as e:
            logger.error(f"Stripe error: {e}")
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Stripe")
        doc["session_id"] = session.session_id
        url = session.url

    elif body.provider == "mercadopago":
        if not MP_ACCESS_TOKEN:
            raise HTTPException(status_code=503, detail="Mercado Pago no está configurado")
        payload = {
            "external_reference": tx_id,
            "items": [{
                "title": title,
                "quantity": 1,
                "unit_price": product["amount_clp"],
                "currency_id": "CLP",
            }],
            "back_urls": {
                "success": f"{origin}/payment-success?tx={tx_id}",
                "failure": f"{origin}/",
                "pending": f"{origin}/payment-success?tx={tx_id}",
            },
            "auto_return": "approved",
            "notification_url": f"{host_url}/api/webhook/mercadopago",
            "metadata": {"device_id": body.device_id, "tx_id": tx_id, "product_id": body.product_id},
            "statement_descriptor": "RAPA NUI GUIA",
        }
        headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as c:
                resp = await c.post("https://api.mercadopago.com/checkout/preferences", json=payload, headers=headers)
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"MP error: {e}")
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Mercado Pago")
        pref = resp.json()
        doc["session_id"] = pref.get("id")
        url = pref.get("init_point")

    elif body.provider == "flow":
        if not (FLOW_API_KEY and FLOW_SECRET_KEY):
            raise HTTPException(status_code=503, detail="Flow no está configurado")
        params = {
            "commerceOrder": tx_id,
            "subject": title,
            "currency": "CLP",
            "amount": product["amount_clp"],
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
                raise HTTPException(status_code=400, detail="Email inválido para Flow")
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
    """Marca una transacción como pagada. Muy simple porque cada tx = 1 producto."""
    now = datetime.now(timezone.utc).isoformat()
    await db.payment_transactions.find_one_and_update(
        {**query, "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "paid_at": now, "last_verified_at": now}},
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
        flow_status = st.get("status")
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
        r = await _resolve_status(doc, request)
        r["product_id"] = doc.get("product_id")
        return r
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status error: {e}")
        raise HTTPException(status_code=502, detail="No se pudo verificar el pago")


# ============================================================
#                    ACCESO / RESTORE
# ============================================================

@api_router.get("/payments/access/{device_id}")
async def check_access(device_id: str):
    """Devuelve la lista de productos desbloqueados en este dispositivo.
    Emergencias siempre está incluido. Sesión válida por 30 días desde
    la última verificación."""
    info = await _resolve_owned_products(device_id)
    return {
        "has_access": info["has_paid"] and info["session_valid"],
        "has_paid": info["has_paid"],
        "needs_verification": info["has_paid"] and not info["session_valid"],
        "owned_products": info["owned"],
        "email": info["email"],
        "session_ttl_hours": SESSION_TTL_HOURS,
    }


class VerifyEmailRequest(BaseModel):
    device_id: str
    email: str


@api_router.post("/payments/verify-email")
async def verify_email(body: VerifyEmailRequest):
    """Verifica que este dispositivo + email tienen acceso, renueva sesión.
    Si el email tiene compras en otro dispositivo, permite vincular SOLO si
    es grant manual del admin.
    """
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")

    now = datetime.now(timezone.utc).isoformat()

    # 1) Renovar sesión de compras propias
    own_paid = await db.payment_transactions.find(
        {"device_id": body.device_id, "email": email, "payment_status": "paid"}
    ).to_list(50)
    if own_paid:
        await db.payment_transactions.update_many(
            {"device_id": body.device_id, "email": email, "payment_status": "paid"},
            {"$set": {"last_verified_at": now}},
        )
        info = await _resolve_owned_products(body.device_id)
        return {"verified": True, "reason": "purchaser", "owned_products": info["owned"],
                "session_ttl_hours": SESSION_TTL_HOURS}

    # 2) ¿Grant ya existe para este device+email?
    grants = await db.access_grants.find({"device_id": body.device_id, "email": email}).to_list(50)
    if grants:
        await db.access_grants.update_many(
            {"device_id": body.device_id, "email": email},
            {"$set": {"verified_at": now}},
        )
        info = await _resolve_owned_products(body.device_id)
        return {"verified": True, "reason": "granted", "owned_products": info["owned"],
                "session_ttl_hours": SESSION_TTL_HOURS}

    # 3) ¿Compras con ese email en OTRO dispositivo?
    others = await db.payment_transactions.find(
        {"email": email, "payment_status": "paid"}
    ).to_list(50)
    if others:
        # Solo grants manuales del admin permiten vincular otro device.
        # Compras reales quedan bloqueadas 1:1.
        manual_txs = [t for t in others if t.get("provider") == "manual"]
        real_txs = [t for t in others if t.get("provider") != "manual"]
        if manual_txs:
            for t in manual_txs:
                await db.access_grants.update_one(
                    {"device_id": body.device_id, "source_tx": t["id"]},
                    {"$set": {
                        "device_id": body.device_id,
                        "email": email,
                        "source_tx": t["id"],
                        "granted_at": now,
                        "verified_at": now,
                    }},
                    upsert=True,
                )
            info = await _resolve_owned_products(body.device_id)
            return {"verified": True, "reason": "manual_grant", "owned_products": info["owned"],
                    "session_ttl_hours": SESSION_TTL_HOURS}
        if real_txs:
            return {
                "verified": False,
                "reason": "wrong_device",
                "message": "Esta compra fue realizada desde otro dispositivo. La app se usa solo en el dispositivo donde se pagó.",
            }

    return {"verified": False, "reason": "no_payment"}


# --- Retorno de Flow ---
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


# ============================================================
#                        WEBHOOKS
# ============================================================

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


# ============================================================
#                     PANEL ADMIN (dueño)
# ============================================================

def _check_admin(request: Request):
    key = request.headers.get("X-Admin-Key") or request.query_params.get("key")
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Clave de administrador incorrecta")


@api_router.get("/admin/sales")
async def admin_sales(request: Request):
    _check_admin(request)
    paid = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"_id": 0, "provider": 1, "amount_clp": 1, "paid_at": 1, "device_id": 1, "email": 1,
         "id": 1, "product_id": 1, "product_name": 1},
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
        prod = p.get("product_id") or "legacy"
        by_product.setdefault(prod, {"count": 0, "total_clp": 0,
                                     "name": PRODUCTS.get(prod, {}).get("name", prod)})
        by_product[prod]["count"] += 1
        by_product[prod]["total_clp"] += p.get("amount_clp", 0)

    pending_count = await db.payment_transactions.count_documents({"payment_status": "pending"})
    granted_count = await db.access_grants.count_documents({})

    return {
        "total_clp": total,
        "sales_count": len(paid),
        "pending_count": pending_count,
        "granted_count": granted_count,
        "by_provider": by_provider,
        "by_product": by_product,
        "recent": [
            {
                "id": p.get("id"),
                "email": p.get("email"),
                "provider": p.get("provider", "stripe"),
                "amount_clp": p.get("amount_clp", 0),
                "paid_at": p.get("paid_at"),
                "product_id": p.get("product_id"),
                "product_name": p.get("product_name"),
                "device_id": (p.get("device_id") or "")[:14],
            }
            for p in paid[:30]
        ],
    }


class GrantRequest(BaseModel):
    email: str
    product_id: str = "routes-all"  # por defecto desbloquea las 11 rutas
    note: str | None = None


@api_router.post("/admin/grant")
async def admin_grant(body: GrantRequest, request: Request):
    """Otorga acceso manual a un producto específico. Por defecto: routes-all.
    Crea una transacción provider=manual que puede ser vinculada a cualquier
    dispositivo del cliente vía verify-email."""
    _check_admin(request)
    email = body.email.strip().lower()
    if not re.match(r"^\S+@\S+\.\S+$", email):
        raise HTTPException(status_code=400, detail="Email inválido")
    if body.product_id not in PRODUCTS:
        raise HTTPException(status_code=400, detail="Producto inválido")
    product = PRODUCTS[body.product_id]

    # ¿Ya tiene este producto?
    existing = await db.payment_transactions.find_one({
        "email": email, "payment_status": "paid", "product_id": body.product_id
    })
    if existing:
        return {"granted": True, "already_had_access": True, "tx_id": existing["id"],
                "product_id": body.product_id, "email": email}

    now = datetime.now(timezone.utc).isoformat()
    tx_id = str(uuid.uuid4())
    access_code = f"{secrets.randbelow(10 ** ACCESS_CODE_LENGTH):0{ACCESS_CODE_LENGTH}d}"
    await db.payment_transactions.insert_one({
        "id": tx_id,
        "provider": "manual",
        "device_id": "",
        "email": email,
        "product_id": body.product_id,
        "product_name": product["name"],
        "origin_url": "",
        "amount_clp": product["amount_clp"],
        "currency": "clp",
        "payment_status": "paid",
        "access_code": access_code,
        "max_devices": MAX_DEVICES_PER_PAYMENT,
        "created_at": now,
        "paid_at": now,
        "manual_note": body.note or "",
    })
    return {"granted": True, "already_had_access": False, "tx_id": tx_id,
            "product_id": body.product_id, "email": email}


class RevokeRequest(BaseModel):
    email: str


@api_router.post("/admin/revoke")
async def admin_revoke(body: RevokeRequest, request: Request):
    """Revoca todos los accesos manuales de un email."""
    _check_admin(request)
    email = body.email.strip().lower()
    r1 = await db.payment_transactions.delete_many({"email": email, "provider": "manual"})
    r2 = await db.access_grants.delete_many({"email": email})
    return {"transactions_removed": r1.deleted_count, "grants_removed": r2.deleted_count}


# ============================================================
#              CONTENIDO EDITABLE (agencias, restaurantes...)
# ============================================================
# Cada categoría es una colección MongoDB simple: {id, name, ...}

EDITABLE_COLLECTIONS = {
    "agencies": {"required": ["name"], "optional": ["phone", "whatsapp", "website", "address", "description"]},
    "restaurants": {"required": ["name"], "optional": ["phone", "whatsapp", "address", "cuisine", "description"]},
    "rentcars": {"required": ["name"], "optional": ["phone", "whatsapp", "website", "address", "description"]},
    "emergencies": {"required": ["name", "phone"], "optional": ["category", "description"]},
}


class ContentItem(BaseModel):
    name: str
    phone: str | None = None
    whatsapp: str | None = None
    website: str | None = None
    address: str | None = None
    description: str | None = None
    cuisine: str | None = None
    category: str | None = None


@api_router.get("/content/{collection}")
async def public_content(collection: str):
    """Lista pública del contenido. La verificación de acceso la hace el frontend."""
    if collection not in EDITABLE_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Colección no existe")
    items = await db[collection].find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"collection": collection, "items": items}


@api_router.get("/content/song/current")
async def get_song_config():
    """Configuración de la canción tradicional (Spotify)."""
    doc = await db.song_config.find_one({"id": "main"}, {"_id": 0})
    if not doc:
        return {"title": "", "artist": "", "spotify_url": "", "description": ""}
    return doc


class SongConfigIn(BaseModel):
    title: str
    artist: str = ""
    spotify_url: str
    description: str = ""


@api_router.post("/admin/song")
async def admin_set_song(body: SongConfigIn, request: Request):
    _check_admin(request)
    await db.song_config.update_one(
        {"id": "main"},
        {"$set": {"id": "main", **body.dict()}},
        upsert=True,
    )
    return {"saved": True, **body.dict()}


@api_router.post("/admin/content/{collection}")
async def admin_create_content(collection: str, body: ContentItem, request: Request):
    _check_admin(request)
    if collection not in EDITABLE_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Colección no existe")
    doc = {"id": str(uuid.uuid4()), **{k: v for k, v in body.dict().items() if v is not None}}
    await db[collection].insert_one({**doc})
    return doc


@api_router.put("/admin/content/{collection}/{item_id}")
async def admin_update_content(collection: str, item_id: str, body: ContentItem, request: Request):
    _check_admin(request)
    if collection not in EDITABLE_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Colección no existe")
    upd = {k: v for k, v in body.dict().items() if v is not None}
    result = await db[collection].update_one({"id": item_id}, {"$set": upd})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    doc = await db[collection].find_one({"id": item_id}, {"_id": 0})
    return doc


@api_router.delete("/admin/content/{collection}/{item_id}")
async def admin_delete_content(collection: str, item_id: str, request: Request):
    _check_admin(request)
    if collection not in EDITABLE_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Colección no existe")
    result = await db[collection].delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    return {"deleted": True}


# --- Editor de Puntos Vai ---
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


# ============================================================
#                     Registro de router + estáticos
# ============================================================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Servir frontend Expo Web como estático ----------------
_FRONTEND_DIST = ROOT_DIR / "web_static"
if not (_FRONTEND_DIST / "index.html").exists():
    _alt = Path("/app/frontend/dist")
    if (_alt / "index.html").exists():
        _FRONTEND_DIST = _alt

if _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
    logger.info(f"Serving Expo Web from {_FRONTEND_DIST}")

    _APP_NAME = "Descubre Rapa Nui"
    _APP_DESC = (
        "La guía completa de senderos, rutas y sitios arqueológicos de Isla de Pascua (Rapa Nui). "
        "Mapa GPS con moáis, playas, puntos de agua y descripción de cada sendero."
    )
    _META_INJECT = (
        f'    <meta name="description" content="{_APP_DESC}" />\n'
        f'    <meta name="application-name" content="{_APP_NAME}" />\n'
        f'    <meta name="apple-mobile-web-app-title" content="{_APP_NAME}" />\n'
        f'    <meta name="apple-mobile-web-app-capable" content="yes" />\n'
        f'    <meta name="theme-color" content="#B35D4A" />\n'
        f'    <meta property="og:title" content="{_APP_NAME}" />\n'
        f'    <meta property="og:description" content="{_APP_DESC}" />\n'
        f'    <meta property="og:type" content="website" />\n'
        f'    <meta property="og:locale" content="es_CL" />\n'
        f'    <meta name="twitter:card" content="summary_large_image" />\n'
        f'    <meta name="twitter:title" content="{_APP_NAME}" />\n'
        f'    <meta name="twitter:description" content="{_APP_DESC}" />\n'
    )
    try:
        _INDEX_HTML = (_FRONTEND_DIST / "index.html").read_text(encoding="utf-8")
        _INDEX_HTML = _INDEX_HTML.replace("<html lang=\"en\"", "<html lang=\"es\"")
        if "application-name" not in _INDEX_HTML:
            _INDEX_HTML = _INDEX_HTML.replace("<title>", _META_INJECT + "    <title>", 1)
    except Exception as _e:
        logger.warning(f"No pude inyectar meta tags: {_e}")
        _INDEX_HTML = (_FRONTEND_DIST / "index.html").read_text(encoding="utf-8")

    _EXPO_DIR = _FRONTEND_DIST / "_expo"
    if _EXPO_DIR.exists():
        app.mount("/_expo", StaticFiles(directory=str(_EXPO_DIR)), name="expo-assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        return FileResponse(_FRONTEND_DIST / "favicon.ico")

    import re as _re_ttf
    _VECTOR_ICON_TTF = _re_ttf.compile(
        r"^assets/node_modules/@expo/vector-icons/build/vendor/"
        r"react-native-vector-icons/Fonts/([A-Za-z0-9_]+)\."
        r"[a-f0-9]+\.ttf$"
    )
    _VECTOR_ICONS_CDN_VERSION = "15.1.1"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api") or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        target = _FRONTEND_DIST / full_path
        if full_path and target.is_file():
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
        _m = _VECTOR_ICON_TTF.match(full_path)
        if _m:
            _font_name = _m.group(1)
            _cdn_url = (
                f"https://cdn.jsdelivr.net/npm/@expo/vector-icons@"
                f"{_VECTOR_ICONS_CDN_VERSION}/build/vendor/"
                f"react-native-vector-icons/Fonts/{_font_name}.ttf"
            )
            return RedirectResponse(url=_cdn_url, status_code=302)
        if "." in full_path.split("/")[-1]:
            raise HTTPException(status_code=404, detail="Not Found")
        return Response(content=_INDEX_HTML, media_type="text/html")

    @app.get("/", include_in_schema=False)
    async def root_index():
        return Response(content=_INDEX_HTML, media_type="text/html")
else:
    logger.warning(f"Expo Web build not found at {_FRONTEND_DIST}. `/` will 404.")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================================
#                        SEED DATA
# ============================================================

SEED_EMERGENCIES = [
    {"name": "Bomberos Rapa Nui", "phone": "132", "category": "Bomberos", "description": "Emergencia de incendios y rescate."},
    {"name": "Hospital Hanga Roa", "phone": "+56 32 2100 215", "category": "Salud", "description": "Hospital principal de la isla."},
    {"name": "Carabineros", "phone": "133", "category": "Policía", "description": "Fuerza policial uniformada."},
    {"name": "PDI Rapa Nui", "phone": "134", "category": "Policía", "description": "Policía de Investigaciones."},
    {"name": "Armada de Chile (Capitanía Hanga Roa)", "phone": "137", "category": "Marina", "description": "Salvamento marítimo."},
    {"name": "SAMU (Ambulancia)", "phone": "131", "category": "Salud", "description": "Servicio de urgencia médica."},
]

SEED_AGENCIES = [
    {"name": "Pukaao Tours", "phone": "+56 9 4232 4189", "whatsapp": "+56 9 4232 4189", "website": "https://pukaomoaitoursrapanui.cl/", "address": "Simon Paoa, Hanga Roa", "description": ""},
    {"name": "Mahinatur", "phone": "+56 9 4052 2156", "whatsapp": "+56 9 4052 2156", "website": "https://mahinatur.cl/", "address": "Atamu Tekena s/n, Centro", "description": ""},
    {"name": "Rapanui Tours", "phone": "+56 9 9070 0582", "whatsapp": "+56 9 9070 0582", "website": "https://www.instagram.com/rapanui_tours", "address": "", "description": ""},
    {"name": "Rangitaki Tour", "phone": "+56 9 5777 6127", "whatsapp": "+56 9 5777 6127", "website": "https://rangitaki.com/", "address": "", "description": ""},
    {"name": "Maori Tour Rapa Nui", "phone": "+56 9 4259 4391", "whatsapp": "+56 9 4259 4391", "website": "https://maoritourrapanui.com/", "address": "", "description": ""},
]

SEED_RESTAURANTS = [
    {"name": 'Napo"ea', "phone": "+56 9 9710 8349", "whatsapp": "+56 9 9710 8349", "website": "https://www.instagram.com/napoeapizzeria/", "address": "Apina Nui, Hanga Roa", "cuisine": "Pizzería", "description": ""},
    {"name": "Vainativa Experience Dinners", "phone": "+56 9 9383 8167", "whatsapp": "+56 9 9383 8167", "website": "https://vainativa.com/", "address": "", "cuisine": "Cena experiencial", "description": ""},
    {"name": "Pea Restobar", "phone": "+56 9 6777 9824", "whatsapp": "+56 9 6777 9824", "website": "https://www.instagram.com/pearestaurant_rapanuioficial/", "address": "Policarpo Toro, Borde Costero", "cuisine": "Restobar", "description": ""},
]

SEED_RENTCARS = [
    {"name": "INSULAR Rent a Car", "phone": "+56 32 2100 480", "website": "https://rentainsular.cl", "address": "Calle Atamu Tekena, Hanga Roa", "description": ""},
    {"name": "Henua Roa", "phone": "+56 9 5786 7782", "whatsapp": "+56 9 5786 7782", "website": "https://henuaroa.cl/arriendo-de-vehiculos-en-rapanui/", "address": "", "description": ""},
    {"name": "Maika Rent a Car", "phone": "+56 9 9352 1015", "whatsapp": "+56 9 9352 1015", "website": "https://maicka.cl/", "address": "Hanga Roa, Rapa Nui", "description": ""},
]

SEED_SONG = {
    "id": "main",
    "title": "He Tuki Tuki Kuara",
    "artist": "Matato'a",
    "spotify_url": "https://open.spotify.com/track/6f9x8N3zJv2sN7ZBqM5t4V",
    "description": "Canción tradicional rapanui interpretada por el grupo Matato'a. Ábrela en Spotify para escucharla completa.",
}


@app.on_event("startup")
async def seed_startup_data():
    # Rutas GPS
    if await db.routes.count_documents({}) == 0:
        try:
            await db.routes.insert_many([{**r} for r in ROUTES])
            logger.info(f"✅ Seeded {len(ROUTES)} routes")
        except Exception as e:
            logger.error(f"Error seeding routes: {e}")
    # Puntos vai
    if await db.water_points.count_documents({}) == 0:
        try:
            await db.water_points.insert_many([{**w} for w in WATER_POINTS])
            logger.info(f"✅ Seeded {len(WATER_POINTS)} water points")
        except Exception as e:
            logger.error(f"Error seeding water points: {e}")
    # Emergencias
    if await db.emergencies.count_documents({}) == 0:
        for item in SEED_EMERGENCIES:
            await db.emergencies.insert_one({"id": str(uuid.uuid4()), **item})
        logger.info(f"✅ Seeded {len(SEED_EMERGENCIES)} emergency contacts")
    # Agencias
    if await db.agencies.count_documents({}) == 0:
        for item in SEED_AGENCIES:
            await db.agencies.insert_one({"id": str(uuid.uuid4()), **item})
        logger.info(f"✅ Seeded {len(SEED_AGENCIES)} agencies")
    # Restaurantes
    if await db.restaurants.count_documents({}) == 0:
        for item in SEED_RESTAURANTS:
            await db.restaurants.insert_one({"id": str(uuid.uuid4()), **item})
        logger.info(f"✅ Seeded {len(SEED_RESTAURANTS)} restaurants")
    # Rent a car
    if await db.rentcars.count_documents({}) == 0:
        for item in SEED_RENTCARS:
            await db.rentcars.insert_one({"id": str(uuid.uuid4()), **item})
        logger.info(f"✅ Seeded {len(SEED_RENTCARS)} rentcars")
    # Canción
    if await db.song_config.count_documents({}) == 0:
        await db.song_config.insert_one({**SEED_SONG})
        logger.info("✅ Seeded song config")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
