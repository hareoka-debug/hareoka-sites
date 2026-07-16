#!/usr/bin/env python3
"""
Backend testing for Descubre Rapa Nui - Post raffle removal verification
Tests against http://localhost:8001 with ADMIN_KEY="RAPANUI-2026"
"""
import requests
import subprocess
import json
import sys

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def run_mongosh(command):
    """Execute mongosh command and return output"""
    try:
        result = subprocess.run(
            ["mongosh", "--quiet", "--eval", command],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout.strip(), result.returncode
    except Exception as e:
        return f"Error: {e}", 1

def test_1_root_html():
    """Test 1: GET / → 200 with HTML"""
    print("\n=== Test 1: GET / → 200 with HTML ===")
    try:
        resp = requests.get(f"{BASE_URL}/", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert "Descubre Rapa Nui" in resp.text, "Title not found in HTML"
        print("✅ PASS: GET / returns 200 with 'Descubre Rapa Nui'")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_2_routes_exactly_11():
    """Test 2: GET /api/routes → 200 with EXACTLY 11 routes"""
    print("\n=== Test 2: GET /api/routes → 200 with EXACTLY 11 routes ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/routes", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert len(data) == 11, f"Expected EXACTLY 11 routes, got {len(data)}"
        
        # Verify expected route IDs
        expected_ids = [
            "circuito-hanga-roa", "costanera-policarpo-toro", "ana-kai-tangata",
            "rano-kau-orongo", "anakena-ovahe", "terevaka", "costa-norte",
            "akivi-ana-te-pahu", "rano-raraku-tongariki", "peninsula-poike", "vinapu"
        ]
        route_ids = [r.get("id") for r in data]
        
        for expected_id in expected_ids:
            assert expected_id in route_ids, f"Expected route '{expected_id}' not found"
        
        # Verify each route has required fields
        for route in data:
            assert "id" in route, "Route missing 'id' field"
            assert "name" in route, "Route missing 'name' field"
            assert "difficulty" in route, "Route missing 'difficulty' field"
            assert "type" in route, "Route missing 'type' field"
        
        print(f"✅ PASS: GET /api/routes returns EXACTLY 11 routes with all expected IDs")
        print(f"   Route IDs: {', '.join(route_ids[:5])}... (showing first 5)")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_3_water_points():
    """Test 3: GET /api/water-points → 200 with array"""
    print("\n=== Test 3: GET /api/water-points → 200 with array ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/water-points", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert len(data) > 0, "Expected at least 1 water point"
        print(f"✅ PASS: GET /api/water-points returns {len(data)} water points")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_4_packages_with_routes():
    """Test 4: GET /api/packages → 200 with 3 packages, routes populated, prices verified"""
    print("\n=== Test 4: GET /api/packages → 200 with 3 packages ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/packages", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "packages" in data, "Missing 'packages' key"
        assert "prices" in data, "Missing 'prices' key"
        
        packages = data["packages"]
        assert len(packages) == 3, f"Expected 3 packages, got {len(packages)}"
        
        # Verify each package
        expected_packages = {
            "hanga-roa": 4,
            "norte-playas": 4,
            "moais-este": 3
        }
        
        for pkg in packages:
            pkg_id = pkg.get("id")
            assert pkg_id in expected_packages, f"Unexpected package ID: {pkg_id}"
            
            assert "name" in pkg, f"Package {pkg_id} missing 'name'"
            assert "routes" in pkg, f"Package {pkg_id} missing 'routes'"
            
            routes = pkg["routes"]
            expected_count = expected_packages[pkg_id]
            assert len(routes) == expected_count, \
                f"Package {pkg_id} expected {expected_count} routes, got {len(routes)}"
            
            # Verify routes are populated (not empty)
            for route in routes:
                assert "id" in route, f"Route in package {pkg_id} missing 'id'"
                assert "name" in route, f"Route in package {pkg_id} missing 'name'"
        
        # Verify prices
        prices = data["prices"]
        assert prices.get("base_clp") == 3000, f"Expected base_clp=3000, got {prices.get('base_clp')}"
        assert prices.get("extra_package_clp") == 3000, f"Expected extra_package_clp=3000, got {prices.get('extra_package_clp')}"
        assert prices.get("all_routes_clp") == 5000, f"Expected all_routes_clp=5000, got {prices.get('all_routes_clp')}"
        
        print(f"✅ PASS: GET /api/packages returns 3 packages with correct routes and prices")
        print(f"   - hanga-roa: {expected_packages['hanga-roa']} routes")
        print(f"   - norte-playas: {expected_packages['norte-playas']} routes")
        print(f"   - moais-este: {expected_packages['moais-este']} routes")
        print(f"   - Prices: base=3000, extra=3000, all=5000 CLP")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_5_no_raffle_fields_in_access():
    """Test 5: Verify NO raffle fields in access endpoint"""
    print("\n=== Test 5: Verify NO raffle fields in /api/payments/access ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/payments/access/dev-inexistente", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get("has_access") == False, "Expected has_access=false for non-existent device"
        
        # Verify NO raffle fields
        assert "raffle_participating" not in data, "Found raffle_participating field (should be removed)"
        assert "raffle_code" not in data, "Found raffle_code field (should be removed)"
        assert "raffle_registered_at" not in data, "Found raffle_registered_at field (should be removed)"
        
        print(f"✅ PASS: GET /api/payments/access returns {data} with NO raffle fields")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_6_insert_purchase_verify_no_raffle():
    """Test 6: Insert purchase + verify access without raffle fields"""
    print("\n=== Test 6: Insert purchase + verify access without raffle fields ===")
    try:
        # Insert test transaction
        insert_cmd = '''db.getSiblingDB("test_database").payment_transactions.insertOne({
            id:"tx-nr",
            provider:"stripe",
            device_id:"dev-nr",
            email:"nr@t.com",
            amount_clp:3000,
            currency:"clp",
            payment_status:"paid",
            access_code:"9999",
            max_devices:1,
            owned_packages:["hanga-roa"],
            created_at:new Date().toISOString(),
            paid_at:new Date().toISOString(),
            last_verified_at:new Date().toISOString()
        })'''
        
        output, code = run_mongosh(insert_cmd)
        assert code == 0, f"Mongosh insert failed: {output}"
        print(f"   Inserted test transaction tx-nr")
        
        # Verify access
        resp = requests.get(f"{BASE_URL}/api/payments/access/dev-nr", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get("has_access") == True, f"Expected has_access=true, got {data.get('has_access')}"
        assert "hanga-roa" in data.get("owned_packages", []), "Expected owned_packages to contain 'hanga-roa'"
        
        # Verify NO raffle fields (can be false or not present, but NOT true)
        if "raffle_participating" in data:
            assert data["raffle_participating"] == False, "raffle_participating should be false or absent"
        
        assert "raffle_code" not in data, "raffle_code should not be present"
        
        print(f"✅ PASS: Access verified with has_access=true, owned_packages=['hanga-roa'], NO raffle fields")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_7_my_info_no_raffle_code():
    """Test 7: GET /api/payments/my-info → NO raffle_code"""
    print("\n=== Test 7: GET /api/payments/my-info/dev-nr → NO raffle_code ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/payments/my-info/dev-nr", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "owned_packages" in data, "Missing 'owned_packages' field"
        assert "hanga-roa" in data["owned_packages"], "Expected 'hanga-roa' in owned_packages"
        
        # Verify NO raffle_code
        assert "raffle_code" not in data, "Found raffle_code field (should be removed)"
        
        print(f"✅ PASS: GET /api/payments/my-info returns owned_packages without raffle_code")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_8_simulate_upgrade_all():
    """Test 8: Simulate upgrade 'all' completed manually"""
    print("\n=== Test 8: Simulate upgrade 'all' completed manually ===")
    try:
        # Insert upgrade transaction
        insert_upgrade_cmd = '''db.getSiblingDB("test_database").payment_transactions.insertOne({
            id:"up-nr-all",
            provider:"mercadopago",
            device_id:"dev-nr",
            email:"nr@t.com",
            amount_clp:5000,
            currency:"clp",
            payment_status:"pending",
            kind:"upgrade",
            upgrade_kind:"all",
            parent_tx:"tx-nr",
            created_at:new Date().toISOString()
        })'''
        
        output, code = run_mongosh(insert_upgrade_cmd)
        assert code == 0, f"Mongosh insert upgrade failed: {output}"
        print(f"   Inserted upgrade transaction up-nr-all")
        
        # Simulate _mark_paid by updating parent transaction
        update_parent_cmd = '''db.getSiblingDB("test_database").payment_transactions.updateOne(
            {id:"tx-nr"},
            {$set:{
                owned_packages:["hanga-roa","norte-playas","moais-este"],
                all_routes_unlocked:true
            }}
        )'''
        
        output, code = run_mongosh(update_parent_cmd)
        assert code == 0, f"Mongosh update parent failed: {output}"
        print(f"   Updated parent transaction to unlock all routes")
        
        # Verify access
        resp = requests.get(f"{BASE_URL}/api/payments/access/dev-nr", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get("all_routes_unlocked") == True, f"Expected all_routes_unlocked=true"
        owned = data.get("owned_packages", [])
        assert len(owned) == 3, f"Expected 3 packages, got {len(owned)}"
        assert "hanga-roa" in owned, "Missing hanga-roa"
        assert "norte-playas" in owned, "Missing norte-playas"
        assert "moais-este" in owned, "Missing moais-este"
        
        # Verify NO raffle info
        assert "raffle_participating" not in data or data.get("raffle_participating") == False, \
            "raffle_participating should be false or absent"
        assert "raffle_code" not in data, "raffle_code should not be present"
        
        print(f"✅ PASS: Upgrade 'all' completed - all_routes_unlocked=true, 3 packages, NO raffle")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_9_upgrade_already_has_package():
    """Test 9: Upgrade endpoint validates - already has package"""
    print("\n=== Test 9: POST /api/payments/upgrade-checkout - already has package ===")
    try:
        payload = {
            "device_id": "dev-nr",
            "email": "nr@t.com",
            "kind": "package",
            "package_id": "hanga-roa",
            "provider": "mercadopago",
            "origin_url": "http://localhost:8001"
        }
        
        resp = requests.post(f"{BASE_URL}/api/payments/upgrade-checkout", json=payload, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        
        assert "detail" in data, "Missing 'detail' field in error response"
        assert "Ya tienes este paquete" in data["detail"], \
            f"Expected 'Ya tienes este paquete' error, got: {data['detail']}"
        
        print(f"✅ PASS: Upgrade endpoint correctly rejects with 400 'Ya tienes este paquete'")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_10_upgrade_invalid_package():
    """Test 10: Upgrade with invalid package"""
    print("\n=== Test 10: POST /api/payments/upgrade-checkout - invalid package ===")
    try:
        payload = {
            "device_id": "dev-nr",
            "email": "nr@t.com",
            "kind": "package",
            "package_id": "INEXISTENTE",
            "provider": "mercadopago",
            "origin_url": "http://localhost:8001"
        }
        
        resp = requests.post(f"{BASE_URL}/api/payments/upgrade-checkout", json=payload, timeout=10)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        data = resp.json()
        
        assert "detail" in data, "Missing 'detail' field in error response"
        assert "Paquete inválido" in data["detail"], \
            f"Expected 'Paquete inválido' error, got: {data['detail']}"
        
        print(f"✅ PASS: Upgrade endpoint correctly rejects with 400 'Paquete inválido'")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_11_verify_email_ok():
    """Test 11: Verify-email still OK"""
    print("\n=== Test 11: POST /api/payments/verify-email - correct email ===")
    try:
        payload = {
            "device_id": "dev-nr",
            "email": "nr@t.com"
        }
        
        resp = requests.post(f"{BASE_URL}/api/payments/verify-email", json=payload, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get("verified") == True, f"Expected verified=true, got {data.get('verified')}"
        
        print(f"✅ PASS: Verify-email returns verified=true for correct email")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_12_verify_email_wrong_device():
    """Test 12: Verify-email wrong device"""
    print("\n=== Test 12: POST /api/payments/verify-email - wrong device ===")
    try:
        payload = {
            "device_id": "otro",
            "email": "nr@t.com"
        }
        
        resp = requests.post(f"{BASE_URL}/api/payments/verify-email", json=payload, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert data.get("verified") == False, f"Expected verified=false, got {data.get('verified')}"
        assert data.get("reason") == "wrong_device", \
            f"Expected reason='wrong_device', got {data.get('reason')}"
        
        print(f"✅ PASS: Verify-email returns verified=false, reason='wrong_device'")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_13_spa_routes():
    """Test 13: SPA routes"""
    print("\n=== Test 13: SPA routes - /upgrade, /select-package, /admin, /map ===")
    try:
        routes = ["/upgrade", "/select-package", "/admin", "/map"]
        for route in routes:
            resp = requests.get(f"{BASE_URL}{route}", timeout=10)
            assert resp.status_code == 200, f"Expected 200 for {route}, got {resp.status_code}"
            assert "html" in resp.headers.get("content-type", "").lower(), \
                f"Expected HTML content-type for {route}"
        
        print(f"✅ PASS: All SPA routes return 200 HTML: {', '.join(routes)}")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_14_assets_fonts():
    """Test 14: Assets fonts"""
    print("\n=== Test 14: GET /assets/.../Feather.ttf → 200 font/ttf ===")
    try:
        font_path = "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf"
        resp = requests.get(f"{BASE_URL}{font_path}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        content_type = resp.headers.get("content-type", "")
        assert "font/ttf" in content_type, f"Expected font/ttf, got {content_type}"
        
        print(f"✅ PASS: Font asset returns 200 with content-type font/ttf")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_15_admin_funciona():
    """Test 15: Admin funciona"""
    print("\n=== Test 15: GET /api/admin/sales?key=RAPANUI-2026 → 200 ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/admin/sales?key={ADMIN_KEY}", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        
        assert "total_clp" in data, "Missing 'total_clp' field"
        assert "sales_count" in data, "Missing 'sales_count' field"
        assert "recent" in data, "Missing 'recent' field"
        
        # Should list tx-nr and up-nr-all
        recent_ids = [item.get("id") for item in data.get("recent", [])]
        assert "tx-nr" in recent_ids, "Expected to find tx-nr in recent sales"
        
        print(f"✅ PASS: Admin sales endpoint returns correct structure with test transactions")
        print(f"   Found {data['sales_count']} sales, total {data['total_clp']} CLP")
        return True
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def cleanup():
    """Cleanup test data"""
    print("\n=== Cleanup: Deleting test data ===")
    try:
        cleanup_cmd = '''db.getSiblingDB("test_database").payment_transactions.deleteMany({email:"nr@t.com"})'''
        output, code = run_mongosh(cleanup_cmd)
        print(f"   Cleaned up test transactions for nr@t.com")
        return True
    except Exception as e:
        print(f"⚠️  Cleanup warning: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND TESTING - Descubre Rapa Nui")
    print("Post raffle removal verification")
    print("Testing against: http://localhost:8001")
    print("=" * 80)
    
    tests = [
        test_1_root_html,
        test_2_routes_exactly_11,
        test_3_water_points,
        test_4_packages_with_routes,
        test_5_no_raffle_fields_in_access,
        test_6_insert_purchase_verify_no_raffle,
        test_7_my_info_no_raffle_code,
        test_8_simulate_upgrade_all,
        test_9_upgrade_already_has_package,
        test_10_upgrade_invalid_package,
        test_11_verify_email_ok,
        test_12_verify_email_wrong_device,
        test_13_spa_routes,
        test_14_assets_fonts,
        test_15_admin_funciona,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ FAIL: Unexpected error in {test.__name__}: {e}")
            results.append(False)
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {total - passed}/{total}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
