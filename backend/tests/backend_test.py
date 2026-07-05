"""Backend tests for Rapa Nui Routes API"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load frontend .env to get the public URL
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ---------- Routes ----------
class TestRoutes:
    def test_list_all_routes(self, s):
        r = s.get(f"{API}/routes", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"Expected 11 routes, got {len(data)}"
        # verify shape
        first = data[0]
        assert {"id", "name", "type", "distance_km", "duration_min", "difficulty", "path", "pois", "vai"}.issubset(first.keys())

    def test_list_urbanas(self, s):
        r = s.get(f"{API}/routes", params={"type": "urbana"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        assert all(x["type"] == "urbana" for x in data)

    def test_list_rurales(self, s):
        r = s.get(f"{API}/routes", params={"type": "rural"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8
        assert all(x["type"] == "rural" for x in data)

    def test_get_route_detail(self, s):
        r = s.get(f"{API}/routes/rano-kau-orongo", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "rano-kau-orongo"
        assert data["type"] == "rural"
        assert isinstance(data["path"], list) and len(data["path"]) > 0
        assert isinstance(data["pois"], list) and len(data["pois"]) > 0
        assert "recommended_liters" in data["vai"]
        assert "buy_point_ids" in data["vai"]

    def test_get_route_not_found(self, s):
        r = s.get(f"{API}/routes/inexistente", timeout=15)
        assert r.status_code == 404


# ---------- Water points ----------
class TestWaterPoints:
    def test_list_water_points(self, s):
        r = s.get(f"{API}/water-points", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 5
        assert all({"id", "name", "lat", "lng", "type"}.issubset(x.keys()) for x in data)


# ---------- Payments ----------
class TestPayments:
    device_id = f"TEST_device_{int(time.time())}"
    session_id_holder = {}

    def test_checkout_creates_session(self, s):
        payload = {"device_id": self.device_id, "origin_url": BASE_URL}
        r = s.post(f"{API}/payments/checkout", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and "session_id" in data
        assert "checkout.stripe.com" in data["url"], f"Unexpected checkout URL: {data['url']}"
        TestPayments.session_id_holder["sid"] = data["session_id"]

    def test_payment_status_pending(self, s):
        sid = TestPayments.session_id_holder.get("sid")
        assert sid, "session_id from previous test missing"
        r = s.get(f"{API}/payments/status/{sid}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "status" in data and "payment_status" in data
        # Not yet paid
        assert data["payment_status"] in ("unpaid", "no_payment_required", "pending"), data

    def test_access_false_for_new_device(self, s):
        r = s.get(f"{API}/payments/access/{self.device_id}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data == {"has_access": False}
