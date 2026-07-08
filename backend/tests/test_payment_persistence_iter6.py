"""Iteration 6 — Bug fix: payment persistence via email.

Covers:
- POST /api/payments/checkout email validation (missing / invalid → 400)
- POST /api/payments/checkout stores email in lowercase in payment_transactions
- POST /api/payments/restore email validation + not-found + happy path
- GET /api/payments/access/{device_id} recognizes access via access_grants
  after a restore call.

Uses pymongo to directly manipulate a test transaction (mark as paid) and
cleans up all TEST_ artefacts at the end.
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# Load env from both backend/.env (MONGO_URL, DB_NAME) and frontend/.env (EXPO_PUBLIC_BACKEND_URL)
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_EMAIL = f"TEST_bugfix_{int(time.time())}@rapanui.cl".lower()
TEST_DEVICE_PAID = f"TEST_device_paid_{int(time.time())}"
TEST_DEVICE_NEW = f"TEST_device_new_{int(time.time())}"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def teardown_module(_module):
    """Purge TEST_ artefacts."""
    c = MongoClient(MONGO_URL)
    try:
        db = c[DB_NAME]
        db.payment_transactions.delete_many({"email": TEST_EMAIL})
        db.payment_transactions.delete_many({"device_id": {"$regex": "^TEST_"}})
        db.access_grants.delete_many({"email": TEST_EMAIL})
        db.access_grants.delete_many({"device_id": {"$regex": "^TEST_"}})
    finally:
        c.close()


# ---------- Checkout email validation ----------
class TestCheckoutEmailValidation:
    def test_checkout_without_email_returns_400(self, s):
        r = s.post(
            f"{API}/payments/checkout",
            json={"device_id": TEST_DEVICE_PAID, "origin_url": BASE_URL, "provider": "stripe"},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "email" in r.text.lower()

    def test_checkout_with_invalid_email_returns_400(self, s):
        r = s.post(
            f"{API}/payments/checkout",
            json={
                "device_id": TEST_DEVICE_PAID,
                "origin_url": BASE_URL,
                "provider": "stripe",
                "email": "notanemail",
            },
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_checkout_with_valid_email_stores_lowercase(self, s, mongo):
        upper_email = "TEST_bugfix_upper@rapanui.CL"
        r = s.post(
            f"{API}/payments/checkout",
            json={
                "device_id": TEST_DEVICE_PAID,
                "origin_url": BASE_URL,
                "provider": "stripe",
                "email": upper_email,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("tx_id")
        # Verify Mongo persisted email in lowercase
        doc = mongo.payment_transactions.find_one({"id": data["tx_id"]})
        assert doc is not None, "transaction not persisted"
        assert doc["email"] == upper_email.strip().lower(), f"expected lowercase: {doc.get('email')}"
        assert doc["payment_status"] == "pending"
        # Cleanup this specific tx (also handled by teardown, safety net)
        mongo.payment_transactions.delete_one({"id": data["tx_id"]})


# ---------- Restore endpoint ----------
class TestRestoreByEmail:
    def test_restore_with_invalid_email_returns_400(self, s):
        r = s.post(
            f"{API}/payments/restore",
            json={"email": "invalid-email", "device_id": TEST_DEVICE_NEW},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_restore_with_unpaid_email_returns_false(self, s):
        r = s.post(
            f"{API}/payments/restore",
            json={
                "email": f"TEST_never_paid_{int(time.time())}@rapanui.cl",
                "device_id": TEST_DEVICE_NEW,
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"has_access": False}

    def test_restore_happy_path_and_access_via_grants(self, s, mongo):
        # 1) Insert a fake paid transaction directly in Mongo (simulate paid via Stripe)
        tx_id = str(uuid.uuid4())
        mongo.payment_transactions.insert_one({
            "id": tx_id,
            "provider": "stripe",
            "device_id": TEST_DEVICE_PAID,
            "email": TEST_EMAIL,
            "origin_url": BASE_URL,
            "amount_clp": 3000,
            "currency": "clp",
            "payment_status": "paid",
            "session_id": f"cs_test_TEST_{tx_id}",
            "created_at": "2026-01-01T00:00:00+00:00",
            "paid_at": "2026-01-01T00:00:01+00:00",
        })

        # 2) NEW device without any local storage restores by email → has_access:true
        r = s.post(
            f"{API}/payments/restore",
            json={"email": TEST_EMAIL.upper(), "device_id": TEST_DEVICE_NEW},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"has_access": True}

        # 3) access_grants entry should now link TEST_DEVICE_NEW to source tx
        grant = mongo.access_grants.find_one({"device_id": TEST_DEVICE_NEW})
        assert grant is not None, "access_grants not created"
        assert grant["email"] == TEST_EMAIL
        assert grant["source_tx"] == tx_id
        assert "granted_at" in grant

        # 4) GET /api/payments/access/{new_device_id} → true (via access_grants)
        r2 = s.get(f"{API}/payments/access/{TEST_DEVICE_NEW}", timeout=15)
        assert r2.status_code == 200
        assert r2.json() == {"has_access": True}, r2.text

    def test_restore_is_idempotent_upsert(self, s, mongo):
        # Repeat restore call: same device_id → still true, single access_grants row
        r = s.post(
            f"{API}/payments/restore",
            json={"email": TEST_EMAIL, "device_id": TEST_DEVICE_NEW},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"has_access": True}
        count = mongo.access_grants.count_documents({"device_id": TEST_DEVICE_NEW})
        assert count == 1, f"expected upsert, got {count} rows"


# ---------- Regression: access endpoint still works via payment_transactions ----------
class TestAccessRegression:
    def test_access_via_paid_transaction_direct(self, s, mongo):
        device = f"TEST_direct_paid_{int(time.time())}"
        mongo.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "provider": "stripe",
            "device_id": device,
            "email": TEST_EMAIL,
            "origin_url": BASE_URL,
            "amount_clp": 3000,
            "currency": "clp",
            "payment_status": "paid",
            "created_at": "2026-01-01T00:00:00+00:00",
            "paid_at": "2026-01-01T00:00:01+00:00",
        })
        r = s.get(f"{API}/payments/access/{device}", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"has_access": True}

    def test_access_false_for_unknown_device(self, s):
        r = s.get(f"{API}/payments/access/TEST_unknown_{int(time.time())}", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"has_access": False}
