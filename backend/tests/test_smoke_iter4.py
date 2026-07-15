"""Iteration 4 smoke tests - post CORS fix + tunnel restore."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://rapa-nui-routes.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Routes endpoint + CORS header verification ---
class TestRoutes:
    def test_routes_returns_11_with_cors(self, api_client):
        headers = {"Origin": "https://rapa-nui-routes.preview.emergentagent.com"}
        r = api_client.get(f"{BASE_URL}/api/routes", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"Expected 11 routes, got {len(data)}"
        # CORS header should be present on responses with Origin
        cors = r.headers.get("access-control-allow-origin") or r.headers.get("Access-Control-Allow-Origin")
        assert cors is not None, f"Missing CORS header. Headers: {dict(r.headers)}"
        assert cors in ("*", "https://rapa-nui-routes.preview.emergentagent.com"), f"Unexpected CORS value: {cors}"
        # Verify circuito-hanga-roa exists
        ids = [x["id"] for x in data]
        assert "circuito-hanga-roa" in ids

    def test_routes_options_preflight(self, api_client):
        # OPTIONS preflight for CORS
        r = api_client.options(
            f"{BASE_URL}/api/routes",
            headers={
                "Origin": "https://rapa-nui-routes.preview.emergentagent.com",
                "Access-Control-Request-Method": "GET",
            },
            timeout=15,
        )
        # 200/204 OK, must expose CORS headers
        assert r.status_code in (200, 204), r.text
        cors = r.headers.get("access-control-allow-origin") or r.headers.get("Access-Control-Allow-Origin")
        assert cors is not None


# --- Payment providers ---
class TestProviders:
    def test_providers_all_true(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/payments/providers", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("stripe") is True
        assert data.get("mercadopago") is True
        assert data.get("flow") is True
        assert data.get("price_clp") == 3000


# --- Admin sales auth ---
class TestAdminSales:
    def test_no_key_returns_401(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/admin/sales", timeout=15)
        assert r.status_code == 401

    def test_wrong_key_returns_401(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/admin/sales",
            headers={"X-Admin-Key": "wrong-key"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_correct_key_returns_200(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/admin/sales",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_clp" in data
        assert "sales_count" in data
        assert "pending_count" in data
        assert "by_provider" in data
        assert "recent" in data
        assert isinstance(data["total_clp"], int)
        assert isinstance(data["sales_count"], int)
        assert isinstance(data["by_provider"], dict)
        assert isinstance(data["recent"], list)
