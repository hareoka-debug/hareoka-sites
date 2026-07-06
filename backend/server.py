from fastapi import FastAPI, APIRouter, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
    return WATER_POINTS


# ---------------- Pagos (Stripe) ----------------
# Precio fijo definido en el servidor: $3.000 CLP (CLP es moneda sin decimales;
# la librería multiplica amount * 100, por lo que 30.0 -> unit_amount 3000 CLP).
PRICE_CLP_DISPLAY = 3000
PRICE_AMOUNT_FOR_LIB = 30.0

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")


class CheckoutRequest(BaseModel):
    device_id: str
    origin_url: str


def _stripe(request: Request) -> StripeCheckout:
    host_url = str(request.base_url).rstrip("/")
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")


@api_router.post("/payments/checkout")
async def create_payment_checkout(body: CheckoutRequest, request: Request):
    origin = body.origin_url.rstrip("/")
    stripe_checkout = _stripe(request)
    try:
        session = await stripe_checkout.create_checkout_session(
            CheckoutSessionRequest(
                amount=PRICE_AMOUNT_FOR_LIB,
                currency="clp",
                success_url=f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{origin}/",
                metadata={"device_id": body.device_id, "product": "guia_rapa_nui"},
            )
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=502, detail="No se pudo iniciar el pago")

    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "device_id": body.device_id,
        "amount_clp": PRICE_CLP_DISPLAY,
        "currency": "clp",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, request: Request):
    stripe_checkout = _stripe(request)
    try:
        status = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logging.getLogger(__name__).error(f"Stripe status error: {e}")
        raise HTTPException(status_code=502, detail="No se pudo verificar el pago")

    if status.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
    elif status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": "pending"},
            {"$set": {"payment_status": "expired"}},
        )
    return {"status": status.status, "payment_status": status.payment_status}


@api_router.get("/payments/access/{device_id}")
async def check_access(device_id: str):
    doc = await db.payment_transactions.find_one(
        {"device_id": device_id, "payment_status": "paid"}
    )
    return {"has_access": doc is not None}


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    stripe_checkout = _stripe(request)
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        if webhook_response.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
        return {"received": True}
    except Exception as e:
        logging.getLogger(__name__).error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook inválido")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
