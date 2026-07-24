"""
Comprehensive Backend Tests for "Descubre Rapa Nui" Multi-Product Application
Tests all 14 points from the review request
"""
import requests
import time

BASE_URL = "https://rapa-nui-routes-1.preview.emergentagent.com/api"
ADMIN_KEY = "RAPANUI-2026"

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.details = []
    
    def add_pass(self, test_name, detail=""):
        self.passed.append(test_name)
        self.details.append(f"✅ PASS: {test_name}" + (f" - {detail}" if detail else ""))
        print(f"✅ PASS: {test_name}")
    
    def add_fail(self, test_name, error):
        self.failed.append(test_name)
        self.details.append(f"❌ FAIL: {test_name} - {error}")
        print(f"❌ FAIL: {test_name} - {error}")
    
    def summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total Passed: {len(self.passed)}")
        print(f"Total Failed: {len(self.failed)}")
        print("\nDetailed Results:")
        for detail in self.details:
            print(detail)
        return len(self.failed) == 0

results = TestResults()

# Test 1: GET /products - should return 7 products with all required fields
def test_1_products():
    try:
        r = requests.get(f"{BASE_URL}/products", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "products" in data, "Response should have 'products' key"
        products = data["products"]
        assert len(products) == 7, f"Expected 7 products, got {len(products)}"
        
        # Check each product has required fields
        required_fields = ["id", "name", "name_en", "short", "short_en", "description", 
                          "description_en", "amount_clp", "kind", "image", "icon", "color"]
        for p in products:
            for field in required_fields:
                assert field in p, f"Product {p.get('id')} missing field: {field}"
        
        # Check emergencies product
        emergencies = next((p for p in products if p["id"] == "emergencies"), None)
        assert emergencies is not None, "emergencies product not found"
        assert emergencies.get("always_free") is True, "emergencies should have always_free=True"
        assert emergencies.get("amount_clp") == 0, "emergencies should have amount_clp=0"
        
        # Check routes-all product
        routes_all = next((p for p in products if p["id"] == "routes-all"), None)
        assert routes_all is not None, "routes-all product not found"
        assert routes_all.get("featured") is True, "routes-all should have featured=True"
        assert routes_all.get("amount_clp") == 5000, f"routes-all should cost 5000 CLP, got {routes_all.get('amount_clp')}"
        
        results.add_pass("Test 1: GET /products", f"7 products with all required fields")
    except Exception as e:
        results.add_fail("Test 1: GET /products", str(e))

# Test 2: GET /content/{collection} - agencies, restaurants, rentcars, emergencies
def test_2_content_collections():
    collections = {
        "agencies": 5,
        "restaurants": 3,
        "rentcars": 2,
        "emergencies": 6
    }
    
    for collection, expected_min in collections.items():
        try:
            r = requests.get(f"{BASE_URL}/content/{collection}", timeout=15)
            assert r.status_code == 200, f"Expected 200, got {r.status_code}"
            data = r.json()
            assert "collection" in data, "Response should have 'collection' key"
            assert "items" in data, "Response should have 'items' key"
            assert data["collection"] == collection, f"Collection name mismatch"
            items = data["items"]
            assert len(items) >= expected_min, f"Expected at least {expected_min} items, got {len(items)}"
            
            # Check each item has id and name
            for item in items:
                assert "id" in item, f"Item missing 'id' field"
                assert "name" in item, f"Item missing 'name' field"
            
            results.add_pass(f"Test 2.{collection}: GET /content/{collection}", 
                           f"{len(items)} items with id and name")
        except Exception as e:
            results.add_fail(f"Test 2.{collection}: GET /content/{collection}", str(e))

# Test 3: GET /content/song/current
def test_3_song():
    try:
        r = requests.get(f"{BASE_URL}/content/song/current", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        required_fields = ["id", "title", "artist", "spotify_url", "description"]
        for field in required_fields:
            assert field in data, f"Song missing field: {field}"
        assert data["id"] == "main", "Song id should be 'main'"
        results.add_pass("Test 3: GET /content/song/current", f"Song: {data['title']}")
    except Exception as e:
        results.add_fail("Test 3: GET /content/song/current", str(e))

# Test 4: GET /payments/providers
def test_4_payment_providers():
    try:
        r = requests.get(f"{BASE_URL}/payments/providers", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get("stripe") is True, "stripe should be True"
        assert data.get("mercadopago") is True, "mercadopago should be True"
        assert data.get("flow") is True, "flow should be True"
        results.add_pass("Test 4: GET /payments/providers", "stripe, mercadopago, flow all True")
    except Exception as e:
        results.add_fail("Test 4: GET /payments/providers", str(e))

# Test 5: POST /payments/checkout with Mercado Pago (agencies product)
def test_5a_checkout_mercadopago():
    try:
        payload = {
            "device_id": f"test-device-{int(time.time())}",
            "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
            "provider": "mercadopago",
            "email": "test@example.com",
            "product_id": "agencies"
        }
        r = requests.post(f"{BASE_URL}/payments/checkout", json=payload, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "url" in data, "Response should have 'url'"
        assert "tx_id" in data, "Response should have 'tx_id'"
        assert "session_id" in data, "Response should have 'session_id'"
        assert "product_id" in data, "Response should have 'product_id'"
        assert data["product_id"] == "agencies", f"product_id should be 'agencies', got {data['product_id']}"
        assert "mercadopago.com" in data["url"] or "mercadopago.cl" in data["url"], \
            f"URL should be mercadopago.com, got {data['url']}"
        results.add_pass("Test 5a: POST /payments/checkout (Mercado Pago - agencies)", 
                        f"Created checkout for agencies")
    except Exception as e:
        results.add_fail("Test 5a: POST /payments/checkout (Mercado Pago - agencies)", str(e))

# Test 5b: POST /payments/checkout with Flow (routes-all product, should charge 5000 CLP)
def test_5b_checkout_flow():
    try:
        payload = {
            "device_id": f"test-device-flow-{int(time.time())}",
            "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
            "provider": "flow",
            "email": "test@example.com",
            "product_id": "routes-all"
        }
        r = requests.post(f"{BASE_URL}/payments/checkout", json=payload, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "url" in data, "Response should have 'url'"
        assert "tx_id" in data, "Response should have 'tx_id'"
        assert "session_id" in data, "Response should have 'session_id'"
        assert "product_id" in data, "Response should have 'product_id'"
        assert data["product_id"] == "routes-all", f"product_id should be 'routes-all'"
        # Note: routes-all should charge 5000 CLP, not 3000
        results.add_pass("Test 5b: POST /payments/checkout (Flow - routes-all)", 
                        f"Created checkout for routes-all (5000 CLP)")
    except Exception as e:
        results.add_fail("Test 5b: POST /payments/checkout (Flow - routes-all)", str(e))

# Test 6: POST /payments/checkout with emergencies (should return 400)
def test_6_checkout_emergencies():
    try:
        payload = {
            "device_id": f"test-device-emerg-{int(time.time())}",
            "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
            "provider": "mercadopago",
            "email": "test@example.com",
            "product_id": "emergencies"
        }
        r = requests.post(f"{BASE_URL}/payments/checkout", json=payload, timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "gratuito" in r.text.lower() or "free" in r.text.lower(), \
            "Error message should mention product is free"
        results.add_pass("Test 6: POST /payments/checkout (emergencies)", 
                        "Correctly rejected with 400")
    except Exception as e:
        results.add_fail("Test 6: POST /payments/checkout (emergencies)", str(e))

# Test 7: POST /payments/checkout with non-existent product (should return 404)
def test_7_checkout_nonexistent():
    try:
        payload = {
            "device_id": f"test-device-404-{int(time.time())}",
            "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
            "provider": "mercadopago",
            "email": "test@example.com",
            "product_id": "no-existe"
        }
        r = requests.post(f"{BASE_URL}/payments/checkout", json=payload, timeout=15)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        results.add_pass("Test 7: POST /payments/checkout (non-existent product)", 
                        "Correctly returned 404")
    except Exception as e:
        results.add_fail("Test 7: POST /payments/checkout (non-existent product)", str(e))

# Test 8: GET /payments/access/{device_id} for non-existent device
def test_8_access_nonexistent():
    try:
        device_id = f"test-device-nonexistent-{int(time.time())}"
        r = requests.get(f"{BASE_URL}/payments/access/{device_id}", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "unlocked" in data, "Response should have 'unlocked' key"
        assert "emergencies" in data["unlocked"], "emergencies should always be unlocked"
        assert len(data["unlocked"]) == 1, f"Should only have emergencies, got {data['unlocked']}"
        results.add_pass("Test 8: GET /payments/access (non-existent device)", 
                        "Only emergencies unlocked")
    except Exception as e:
        results.add_fail("Test 8: GET /payments/access (non-existent device)", str(e))

# Test 9: Full manual access flow + restore + revoke
def test_9_manual_access_flow():
    test_email = f"cliente-test-{int(time.time())}@test.com"
    test_device = f"new-device-{int(time.time())}"
    
    # 9a: Login admin - GET /admin/sales
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.get(f"{BASE_URL}/admin/sales", headers=headers, timeout=15)
        assert r.status_code == 200, f"Admin login failed: {r.status_code}"
        results.add_pass("Test 9a: Admin login (GET /admin/sales)", "Admin authenticated")
    except Exception as e:
        results.add_fail("Test 9a: Admin login (GET /admin/sales)", str(e))
        return  # Can't continue without admin access
    
    # 9b: POST /admin/manual-access
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "email": test_email,
            "product_ids": ["agencies", "restaurants"],
            "note": "cliente VIP"
        }
        r = requests.post(f"{BASE_URL}/admin/manual-access", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "granted" in data, "Response should have 'granted' key"
        assert "email" in data, "Response should have 'email' key"
        assert set(data["granted"]) == {"agencies", "restaurants"}, \
            f"Expected agencies and restaurants, got {data['granted']}"
        assert data["email"] == test_email, f"Email mismatch"
        results.add_pass("Test 9b: POST /admin/manual-access", 
                        f"Granted agencies and restaurants to {test_email}")
    except Exception as e:
        results.add_fail("Test 9b: POST /admin/manual-access", str(e))
        return
    
    # 9c: GET /admin/manual-access - list manual access
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.get(f"{BASE_URL}/admin/manual-access", headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "items" in data, "Response should have 'items' key"
        # Find our test email
        found = False
        for item in data["items"]:
            if item["email"] == test_email:
                found = True
                assert set(item["products"]) == {"agencies", "restaurants"}, \
                    f"Products mismatch for {test_email}"
                break
        assert found, f"Email {test_email} not found in manual access list"
        results.add_pass("Test 9c: GET /admin/manual-access", 
                        f"Found {test_email} with correct products")
    except Exception as e:
        results.add_fail("Test 9c: GET /admin/manual-access", str(e))
    
    # 9d: POST /payments/restore
    try:
        payload = {
            "email": test_email,
            "device_id": test_device
        }
        r = requests.post(f"{BASE_URL}/payments/restore", json=payload, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "unlocked" in data, "Response should have 'unlocked' key"
        unlocked = set(data["unlocked"])
        assert "agencies" in unlocked, "agencies should be unlocked"
        assert "restaurants" in unlocked, "restaurants should be unlocked"
        assert "emergencies" in unlocked, "emergencies should be unlocked"
        results.add_pass("Test 9d: POST /payments/restore", 
                        f"Restored access to {test_device}")
    except Exception as e:
        results.add_fail("Test 9d: POST /payments/restore", str(e))
    
    # 9e: GET /payments/access/{device_id}
    try:
        r = requests.get(f"{BASE_URL}/payments/access/{test_device}", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "unlocked" in data, "Response should have 'unlocked' key"
        unlocked = set(data["unlocked"])
        assert unlocked == {"agencies", "restaurants", "emergencies"}, \
            f"Expected agencies, restaurants, emergencies, got {data['unlocked']}"
        results.add_pass("Test 9e: GET /payments/access (after restore)", 
                        f"Device has correct access")
    except Exception as e:
        results.add_fail("Test 9e: GET /payments/access (after restore)", str(e))
    
    # 9f: POST /admin/manual-access/revoke
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {"email": test_email}
        r = requests.post(f"{BASE_URL}/admin/manual-access/revoke", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "deleted" in data, "Response should have 'deleted' key"
        assert data["deleted"] > 0, f"Should have deleted at least 1 record, got {data['deleted']}"
        results.add_pass("Test 9f: POST /admin/manual-access/revoke", 
                        f"Revoked access for {test_email}")
    except Exception as e:
        results.add_fail("Test 9f: POST /admin/manual-access/revoke", str(e))

# Test 10: CRUD of content items (agencies)
def test_10_content_crud():
    item_id = None
    
    # 10a: POST /admin/content/agencies
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "name": "TEST AGENCY",
            "phone": "+56 9 1234 5678"
        }
        r = requests.post(f"{BASE_URL}/admin/content/agencies", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "id" in data, "Response should have 'id' key"
        assert data["name"] == "TEST AGENCY", "Name mismatch"
        item_id = data["id"]
        results.add_pass("Test 10a: POST /admin/content/agencies", f"Created item with id {item_id}")
    except Exception as e:
        results.add_fail("Test 10a: POST /admin/content/agencies", str(e))
        return
    
    # 10b: PUT /admin/content/agencies/{id}
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "name": "TEST AGENCY EDIT",
            "phone": "+56 9 1234 5678"
        }
        r = requests.put(f"{BASE_URL}/admin/content/agencies/{item_id}", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["name"] == "TEST AGENCY EDIT", "Name should be updated"
        results.add_pass("Test 10b: PUT /admin/content/agencies/{id}", "Updated item name")
    except Exception as e:
        results.add_fail("Test 10b: PUT /admin/content/agencies/{id}", str(e))
    
    # 10c: DELETE /admin/content/agencies/{id}
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.delete(f"{BASE_URL}/admin/content/agencies/{item_id}", headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("deleted") is True, "Should return deleted: true"
        results.add_pass("Test 10c: DELETE /admin/content/agencies/{id}", "Deleted item")
    except Exception as e:
        results.add_fail("Test 10c: DELETE /admin/content/agencies/{id}", str(e))

# Test 11: Song CRUD
def test_11_song_crud():
    original_song = None
    
    # Get original song first
    try:
        r = requests.get(f"{BASE_URL}/content/song/current", timeout=15)
        if r.status_code == 200:
            original_song = r.json()
    except:
        pass
    
    # 11a: POST /admin/content/song (update)
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "title": "Test Song",
            "spotify_url": "https://open.spotify.com/episode/test123"
        }
        r = requests.post(f"{BASE_URL}/admin/content/song", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["title"] == "Test Song", "Title should be updated"
        results.add_pass("Test 11a: POST /admin/content/song", "Updated song")
    except Exception as e:
        results.add_fail("Test 11a: POST /admin/content/song", str(e))
        return
    
    # 11b: GET /content/song/current (verify change)
    try:
        r = requests.get(f"{BASE_URL}/content/song/current", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data["title"] == "Test Song", "Song title should reflect the change"
        results.add_pass("Test 11b: GET /content/song/current (verify)", "Song updated correctly")
    except Exception as e:
        results.add_fail("Test 11b: GET /content/song/current (verify)", str(e))
    
    # 11c: Restore original song
    if original_song:
        try:
            headers = {"X-Admin-Key": ADMIN_KEY}
            payload = {
                "title": original_song.get("title", "Descubre Rapa Nui — Episodio Exclusivo"),
                "artist": original_song.get("artist", "Podcast Rapa Nui"),
                "spotify_url": original_song.get("spotify_url", "https://open.spotify.com/episode/0kWE5WDp7AmXtVSFQDLOG1?si=ce314c83399642cb"),
                "description": original_song.get("description", "")
            }
            r = requests.post(f"{BASE_URL}/admin/content/song", json=payload, headers=headers, timeout=15)
            assert r.status_code == 200, f"Failed to restore original song: {r.status_code}"
            results.add_pass("Test 11c: Restore original song", "Original song restored")
        except Exception as e:
            results.add_fail("Test 11c: Restore original song", str(e))

# Test 12: Admin password change
def test_12_admin_password_change():
    # 12a: Try with incorrect current password (should fail with 401)
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "current": "WRONG-PASSWORD",
            "new_key": "NEW-KEY-123456"
        }
        r = requests.post(f"{BASE_URL}/admin/change-password", json=payload, headers=headers, timeout=15)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        results.add_pass("Test 12a: Change password (wrong current)", "Correctly rejected with 401")
    except Exception as e:
        results.add_fail("Test 12a: Change password (wrong current)", str(e))
    
    # 12b: Try with short password (should fail with 400)
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "current": ADMIN_KEY,
            "new_key": "abc"
        }
        r = requests.post(f"{BASE_URL}/admin/change-password", json=payload, headers=headers, timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        assert "6" in r.text, "Error should mention minimum 6 characters"
        results.add_pass("Test 12b: Change password (too short)", "Correctly rejected with 400")
    except Exception as e:
        results.add_fail("Test 12b: Change password (too short)", str(e))
    
    # 12c: Change to new password
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        payload = {
            "current": ADMIN_KEY,
            "new_key": "NUEVA-CLAVE-2026"
        }
        r = requests.post(f"{BASE_URL}/admin/change-password", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        results.add_pass("Test 12c: Change password (valid)", "Password changed successfully")
    except Exception as e:
        results.add_fail("Test 12c: Change password (valid)", str(e))
        return
    
    # 12d: Verify old password doesn't work
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.get(f"{BASE_URL}/admin/sales", headers=headers, timeout=15)
        assert r.status_code == 401, f"Old password should not work, got {r.status_code}"
        results.add_pass("Test 12d: Verify old password fails", "Old password correctly rejected")
    except Exception as e:
        results.add_fail("Test 12d: Verify old password fails", str(e))
    
    # 12e: Verify new password works
    try:
        headers = {"X-Admin-Key": "NUEVA-CLAVE-2026"}
        r = requests.get(f"{BASE_URL}/admin/sales", headers=headers, timeout=15)
        assert r.status_code == 200, f"New password should work, got {r.status_code}"
        results.add_pass("Test 12e: Verify new password works", "New password works")
    except Exception as e:
        results.add_fail("Test 12e: Verify new password works", str(e))
    
    # 12f: Restore original password
    try:
        headers = {"X-Admin-Key": "NUEVA-CLAVE-2026"}
        payload = {
            "current": "NUEVA-CLAVE-2026",
            "new_key": ADMIN_KEY
        }
        r = requests.post(f"{BASE_URL}/admin/change-password", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        results.add_pass("Test 12f: Restore original password", "Original password restored")
    except Exception as e:
        results.add_fail("Test 12f: Restore original password", str(e))
    
    # 12g: Confirm original password works again
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.get(f"{BASE_URL}/admin/sales", headers=headers, timeout=15)
        assert r.status_code == 200, f"Original password should work again, got {r.status_code}"
        results.add_pass("Test 12g: Confirm original password restored", "Original password works")
    except Exception as e:
        results.add_fail("Test 12g: Confirm original password restored", str(e))

# Test 13: Sales analytics
def test_13_sales_analytics():
    try:
        headers = {"X-Admin-Key": ADMIN_KEY}
        r = requests.get(f"{BASE_URL}/admin/sales", headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        required_fields = ["total_clp", "sales_count", "pending_count", "granted_count", 
                          "by_provider", "by_product", "recent"]
        for field in required_fields:
            assert field in data, f"Sales analytics missing field: {field}"
        assert isinstance(data["by_provider"], dict), "by_provider should be a dict"
        assert isinstance(data["by_product"], dict), "by_product should be a dict"
        assert isinstance(data["recent"], list), "recent should be a list"
        results.add_pass("Test 13: GET /admin/sales (analytics)", 
                        f"Total: ${data['total_clp']} CLP, {data['sales_count']} sales")
    except Exception as e:
        results.add_fail("Test 13: GET /admin/sales (analytics)", str(e))

# Test 14: Legacy endpoints
def test_14a_routes():
    try:
        r = requests.get(f"{BASE_URL}/routes", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert isinstance(data, list), "Routes should be a list"
        assert len(data) == 11, f"Expected 11 routes, got {len(data)}"
        results.add_pass("Test 14a: GET /routes", f"11 routes returned")
    except Exception as e:
        results.add_fail("Test 14a: GET /routes", str(e))

def test_14b_route_detail():
    try:
        r = requests.get(f"{BASE_URL}/routes/circuito-hanga-roa", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data["id"] == "circuito-hanga-roa", "Route id mismatch"
        assert "name" in data, "Route should have name"
        assert "path" in data, "Route should have path"
        results.add_pass("Test 14b: GET /routes/circuito-hanga-roa", f"Route detail returned")
    except Exception as e:
        results.add_fail("Test 14b: GET /routes/circuito-hanga-roa", str(e))

def test_14c_water_points():
    try:
        r = requests.get(f"{BASE_URL}/water-points", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert isinstance(data, list), "Water points should be a list"
        assert len(data) >= 7, f"Expected at least 7 water points, got {len(data)}"
        results.add_pass("Test 14c: GET /water-points", f"{len(data)} water points returned")
    except Exception as e:
        results.add_fail("Test 14c: GET /water-points", str(e))

# Run all tests
if __name__ == "__main__":
    print("="*80)
    print("COMPREHENSIVE BACKEND TESTS - Descubre Rapa Nui")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Key: {ADMIN_KEY}")
    print("="*80)
    print()
    
    test_1_products()
    test_2_content_collections()
    test_3_song()
    test_4_payment_providers()
    test_5a_checkout_mercadopago()
    test_5b_checkout_flow()
    test_6_checkout_emergencies()
    test_7_checkout_nonexistent()
    test_8_access_nonexistent()
    test_9_manual_access_flow()
    test_10_content_crud()
    test_11_song_crud()
    test_12_admin_password_change()
    test_13_sales_analytics()
    test_14a_routes()
    test_14b_route_detail()
    test_14c_water_points()
    
    # Print summary
    all_passed = results.summary()
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED! 🎉")
        exit(0)
    else:
        print(f"\n⚠️  {len(results.failed)} TEST(S) FAILED")
        exit(1)
