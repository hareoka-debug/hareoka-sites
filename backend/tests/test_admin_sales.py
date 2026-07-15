"""Backend tests for Iteration 3 - Admin sales endpoint + regression.

Verifies:
- GET /api/admin/sales requires X-Admin-Key header matching ADMIN_KEY
- Response shape: total_clp (int), sales_count, pending_count, by_provider, recent
- Regression: /api/routes returns 11 routes; /api/payments/providers returns
  {stripe:true, mercadopago:true, flow:true, price_clp:3000}

Do NOT complete any Mercado Pago or Flow payment (production credentials).
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ---------- Regression: routes count ----------
class TestRoutesRegression:
    def test_list_all_routes_is_11(self, s):
        r = s.get(f"{API}/routes", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"Expected 11 routes, got {len(data)}"


# ---------- Regression: providers metadata ----------
class TestProvidersRegression:
    def test_providers_all_true_and_price_3000(self, s):
        r = s.get(f"{API}/payments/providers", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("stripe") is True, data
        assert data.get("mercadopago") is True, data
        assert data.get("flow") is True, data
        assert data.get("price_clp") == 3000, data


# ---------- Admin sales endpoint ----------
class TestAdminSalesAuth:
    def test_missing_header_returns_401(self, s):
        r = requests.get(f"{API}/admin/sales", timeout=15)
        assert r.status_code == 401, r.text

    def test_wrong_key_returns_401(self, s):
        r = requests.get(
            f"{API}/admin/sales",
            headers={"X-Admin-Key": "WRONG-KEY"},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_empty_key_returns_401(self, s):
        r = requests.get(
            f"{API}/admin/sales",
            headers={"X-Admin-Key": ""},
            timeout=15,
        )
        assert r.status_code == 401, r.text


class TestAdminSalesShape:
    def test_valid_key_returns_200_and_correct_shape(self, s):
        r = requests.get(
            f"{API}/admin/sales",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # Top-level keys
        for k in ("total_clp", "sales_count", "pending_count", "by_provider", "recent"):
            assert k in data, f"Missing key '{k}' in response: {data.keys()}"

        # Types
        assert isinstance(data["total_clp"], int), f"total_clp must be int, got {type(data['total_clp'])}"
        assert isinstance(data["sales_count"], int), f"sales_count must be int"
        assert isinstance(data["pending_count"], int), f"pending_count must be int"
        assert isinstance(data["by_provider"], dict), f"by_provider must be dict"
        assert isinstance(data["recent"], list), f"recent must be list"

        # Non-negative
        assert data["total_clp"] >= 0
        assert data["sales_count"] >= 0
        assert data["pending_count"] >= 0

        # by_provider structure: dict of provider -> {count:int, total_clp:int}
        for prov, agg in data["by_provider"].items():
            assert isinstance(prov, str), f"provider key must be str, got {type(prov)}"
            assert isinstance(agg, dict), f"by_provider[{prov}] must be dict"
            assert "count" in agg and isinstance(agg["count"], int), f"by_provider[{prov}].count missing/not int"
            assert "total_clp" in agg and isinstance(agg["total_clp"], int), f"by_provider[{prov}].total_clp missing/not int"
            assert agg["count"] >= 0 and agg["total_clp"] >= 0

        # recent structure: each item has provider, amount_clp, paid_at, device_id
        assert len(data["recent"]) <= 30, "recent must be <=30 items"
        for item in data["recent"]:
            assert isinstance(item, dict)
            assert "provider" in item and isinstance(item["provider"], str)
            assert "amount_clp" in item and isinstance(item["amount_clp"], int)
            assert "paid_at" in item  # datetime serialized or None
            assert "device_id" in item and isinstance(item["device_id"], str)
            # device_id is truncated to <=14 chars
            assert len(item["device_id"]) <= 14, f"device_id must be truncated to <=14 chars: {item['device_id']!r}"

    def test_sales_count_matches_recent_when_leq_30(self, s):
        """Consistency: sales_count == sum of by_provider counts."""
        r = requests.get(
            f"{API}/admin/sales",
            headers={"X-Admin-Key": ADMIN_KEY},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        total_from_providers = sum(agg["count"] for agg in data["by_provider"].values())
        assert total_from_providers == data["sales_count"], (
            f"sum(by_provider.count)={total_from_providers} != sales_count={data['sales_count']}"
        )
        total_clp_from_providers = sum(agg["total_clp"] for agg in data["by_provider"].values())
        assert total_clp_from_providers == data["total_clp"], (
            f"sum(by_provider.total_clp)={total_clp_from_providers} != total_clp={data['total_clp']}"
        )

    def test_query_param_key_also_accepted(self, s):
        """Endpoint also accepts ?key= as alternative to header."""
        r = requests.get(f"{API}/admin/sales", params={"key": ADMIN_KEY}, timeout=15)
        assert r.status_code == 200, r.text
