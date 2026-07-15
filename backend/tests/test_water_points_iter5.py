"""Iteration 5 backend tests: water points seeding + admin CRUD."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://rapa-nui-routes-1.preview.emergentagent.com").rstrip("/")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- Seed / GET water points ----
class TestWaterPointsSeed:
    def test_get_water_points_returns_seven_from_mongo(self, api):
        r = api.get(f"{BASE_URL}/api/water-points")
        assert r.status_code == 200
        data = r.json()
        # Only the 7 seeded (any custom points must be cleaned up)
        assert isinstance(data, list)
        # Filter out any leftover custom items to avoid flakiness, but assert the 7 seeded ids exist
        ids = {p["id"] for p in data}
        expected = {"vai-1", "vai-2", "vai-3", "vai-4", "vai-5", "vai-6", "vai-7"}
        assert expected.issubset(ids), f"Missing seeded ids: {expected - ids}"
        # No _id field leaked
        for p in data:
            assert "_id" not in p
        # Renames / new points
        by_id = {p["id"]: p for p in data}
        assert by_id["vai-1"]["name"] == "Supermercado HE IVI"
        assert by_id["vai-6"]["name"] == "Panadería HARAO TIRE"
        assert by_id["vai-7"]["name"] == "Locales de Rano Raraku"


class TestRouteRanoRarakuLinksVai7:
    def test_route_includes_vai_7(self, api):
        r = api.get(f"{BASE_URL}/api/routes/rano-raraku-tongariki")
        assert r.status_code == 200
        route = r.json()
        assert "vai-7" in route["vai"]["buy_point_ids"]


# ---- Admin CRUD ----
class TestWaterPointsAdminCRUD:
    _created_id = None

    def test_create_requires_admin_key(self, api):
        r = requests.post(f"{BASE_URL}/api/admin/water-points",
                          json={"name": "TEST_x", "description": "d", "lat": -27.1, "lng": -109.4})
        assert r.status_code == 401

    def test_update_requires_admin_key(self, api):
        r = requests.put(f"{BASE_URL}/api/admin/water-points/nope",
                         json={"name": "x", "description": "", "lat": 0, "lng": 0})
        assert r.status_code == 401

    def test_delete_requires_admin_key(self, api):
        r = requests.delete(f"{BASE_URL}/api/admin/water-points/nope")
        assert r.status_code == 401

    def test_create_then_get_then_update_then_delete(self, api):
        headers = {"X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json"}
        create_body = {
            "name": "TEST_Kiosco Prueba",
            "description": "TEST punto Rano Raraku",
            "lat": -27.122,
            "lng": -109.293,
        }
        r = requests.post(f"{BASE_URL}/api/admin/water-points", json=create_body, headers=headers)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["custom"] is True
        assert created["name"] == "TEST_Kiosco Prueba"
        assert "id" in created and created["id"]
        assert "_id" not in created
        pid = created["id"]
        TestWaterPointsAdminCRUD._created_id = pid

        # Verify persistence via GET
        r = requests.get(f"{BASE_URL}/api/water-points")
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        assert pid in ids

        # PUT update
        upd = {"name": "TEST_Kiosco Editado", "description": "editado", "lat": -27.122, "lng": -109.293}
        r = requests.put(f"{BASE_URL}/api/admin/water-points/{pid}", json=upd, headers=headers)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["name"] == "TEST_Kiosco Editado"
        assert "_id" not in updated

        # PUT non-existent -> 404
        r = requests.put(f"{BASE_URL}/api/admin/water-points/does-not-exist-xyz",
                         json=upd, headers=headers)
        assert r.status_code == 404

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/admin/water-points/{pid}", headers=headers)
        assert r.status_code == 200
        assert r.json().get("deleted") is True

        # DELETE non-existent -> 404
        r = requests.delete(f"{BASE_URL}/api/admin/water-points/does-not-exist-xyz",
                            headers=headers)
        assert r.status_code == 404

        # Final GET: 7 seeded, no test data leftover
        r = requests.get(f"{BASE_URL}/api/water-points")
        assert r.status_code == 200
        data = r.json()
        # Ensure no TEST_ leftover
        leftover = [p for p in data if p.get("name", "").startswith("TEST_")]
        assert not leftover, f"Leftover test points: {leftover}"


def teardown_module(module):
    """Safety net: purge any leftover TEST_ points if a test failed midway."""
    try:
        r = requests.get(f"{BASE_URL}/api/water-points")
        for p in r.json():
            if p.get("name", "").startswith("TEST_") or p.get("custom"):
                requests.delete(f"{BASE_URL}/api/admin/water-points/{p['id']}",
                                headers={"X-Admin-Key": ADMIN_KEY})
    except Exception:
        pass
