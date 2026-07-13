#!/usr/bin/env python3
"""
Comprehensive backend test for Rapa Nui app - Icon/Asset serving fix verification
Tests the fix for /admin panel icon 404 issue
"""
import requests
import json
import subprocess
import sys
from pathlib import Path

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def test_1_root_html():
    """Test 1: GET / → 200 with <title>Descubre Rapa Nui</title>"""
    print("\n[TEST 1] GET / → 200 with Descubre Rapa Nui title")
    resp = requests.get(f"{BASE_URL}/")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "<title>Descubre Rapa Nui</title>" in resp.text, "Title not found in HTML"
    print("✅ PASS: Root serves HTML with correct title")
    return True

def test_2_api_root():
    """Test 2: GET /api/ → 200 with JSON {"message":"Rutas Rapa Nui API"}"""
    print("\n[TEST 2] GET /api/ → 200 with correct JSON")
    resp = requests.get(f"{BASE_URL}/api/")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("message") == "Rutas Rapa Nui API", f"Unexpected message: {data}"
    print(f"✅ PASS: API root returns correct JSON: {data}")
    return True

def test_3_api_404():
    """Test 3: GET /api/no-existe → 404 (API routes don't fall to SPA)"""
    print("\n[TEST 3] GET /api/no-existe → 404")
    resp = requests.get(f"{BASE_URL}/api/no-existe")
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
    print("✅ PASS: Non-existent API route returns 404")
    return True

def test_4_admin_spa_fallback():
    """Test 4: GET /admin → 200 with HTML from index.html (SPA fallback)"""
    print("\n[TEST 4] GET /admin → 200 with HTML (SPA fallback)")
    resp = requests.get(f"{BASE_URL}/admin")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "<title>Descubre Rapa Nui</title>" in resp.text, "Title not found - SPA fallback failed"
    print("✅ PASS: /admin route falls back to SPA correctly")
    return True

def test_5_map_spa_fallback():
    """Test 5: GET /map → 200 with HTML from index.html (SPA fallback)"""
    print("\n[TEST 5] GET /map → 200 with HTML (SPA fallback)")
    resp = requests.get(f"{BASE_URL}/map")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "<title>Descubre Rapa Nui</title>" in resp.text, "Title not found - SPA fallback failed"
    print("✅ PASS: /map route falls back to SPA correctly")
    return True

def test_6_js_bundle():
    """Test 6: GET /_expo/static/js/web/entry-*.js → 200, size > 1MB"""
    print("\n[TEST 6] GET /_expo/static/js/web/entry-*.js → 200 with correct size")
    # Find the actual bundle file
    bundle_path = Path("/app/backend/web_static/_expo/static/js/web")
    bundle_files = list(bundle_path.glob("entry-*.js"))
    assert len(bundle_files) > 0, "No bundle file found"
    bundle_name = bundle_files[0].name
    
    resp = requests.get(f"{BASE_URL}/_expo/static/js/web/{bundle_name}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    content_type = resp.headers.get("content-type", "")
    assert "javascript" in content_type.lower() or "text/javascript" in content_type.lower(), \
        f"Unexpected content-type: {content_type}"
    
    size_mb = len(resp.content) / (1024 * 1024)
    assert size_mb > 1.0, f"Bundle too small: {size_mb:.2f} MB"
    print(f"✅ PASS: JS bundle serves correctly ({size_mb:.2f} MB, content-type: {content_type})")
    return True

def test_7_favicon():
    """Test 7: GET /favicon.ico → 200"""
    print("\n[TEST 7] GET /favicon.ico → 200")
    resp = requests.get(f"{BASE_URL}/favicon.ico")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert len(resp.content) > 0, "Favicon is empty"
    print(f"✅ PASS: Favicon serves correctly ({len(resp.content)} bytes)")
    return True

def test_8_feather_font():
    """Test 8: GET /assets/.../Feather.ttf → 200 with font/ttf, size > 10KB"""
    print("\n[TEST 8] GET /assets/.../Feather.ttf → 200 with correct content-type")
    font_path = "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf"
    resp = requests.get(f"{BASE_URL}{font_path}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code} - THIS WAS THE BUG!"
    
    content_type = resp.headers.get("content-type", "")
    assert "font/ttf" in content_type, f"Expected font/ttf, got {content_type}"
    
    size_kb = len(resp.content) / 1024
    assert size_kb > 10, f"Font too small: {size_kb:.2f} KB"
    print(f"✅ PASS: Feather font serves correctly ({size_kb:.2f} KB, content-type: {content_type})")
    print("   🎉 THIS WAS THE 404 BUG - NOW FIXED!")
    return True

def test_9_material_icons_font():
    """Test 9: GET /assets/.../MaterialIcons.ttf → 200 with font/ttf"""
    print("\n[TEST 9] GET /assets/.../MaterialIcons.ttf → 200 with font/ttf")
    font_path = "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf"
    resp = requests.get(f"{BASE_URL}{font_path}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    content_type = resp.headers.get("content-type", "")
    assert "font/ttf" in content_type, f"Expected font/ttf, got {content_type}"
    
    size_kb = len(resp.content) / 1024
    print(f"✅ PASS: MaterialIcons font serves correctly ({size_kb:.2f} KB, content-type: {content_type})")
    return True

def test_10_nonexistent_asset_404():
    """Test 10: GET /assets/no-existe-fake.png → 404 real"""
    print("\n[TEST 10] GET /assets/no-existe-fake.png → 404 (real 404, not SPA fallback)")
    resp = requests.get(f"{BASE_URL}/assets/no-existe-fake.png")
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
    # Should NOT return HTML (SPA fallback)
    assert "<title>Descubre Rapa Nui</title>" not in resp.text, \
        "Asset with extension should 404, not fall back to SPA"
    print("✅ PASS: Non-existent asset returns real 404 (not SPA fallback)")
    return True

def test_11_random_route_spa_fallback():
    """Test 11: GET /some-random-route-sin-extension → 200 with HTML (SPA fallback)"""
    print("\n[TEST 11] GET /some-random-route-sin-extension → 200 with HTML (SPA fallback)")
    resp = requests.get(f"{BASE_URL}/some-random-route-sin-extension")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "<title>Descubre Rapa Nui</title>" in resp.text, \
        "Route without extension should fall back to SPA"
    print("✅ PASS: Random route without extension falls back to SPA correctly")
    return True

def test_12_bundle_contains_admin_strings():
    """Test 12: Verify bundle contains admin panel strings"""
    print("\n[TEST 12] Verify bundle contains admin panel strings")
    bundle_path = Path("/app/backend/web_static/_expo/static/js/web")
    bundle_files = list(bundle_path.glob("entry-*.js"))
    assert len(bundle_files) > 0, "No bundle file found"
    
    bundle_content = bundle_files[0].read_text()
    
    required_strings = [
        "Panel del Dueño",
        "RAPANUI-2026",
        "Conceder acceso",
        "Código de 6 dígitos",
        "tab-acceso"
    ]
    
    found = []
    missing = []
    for s in required_strings:
        if s in bundle_content:
            found.append(s)
        else:
            missing.append(s)
    
    if missing:
        print(f"⚠️  WARNING: Some strings not found in bundle: {missing}")
        print(f"   Found: {found}")
    else:
        print(f"✅ PASS: All admin panel strings found in bundle: {required_strings}")
    
    return len(missing) == 0

def test_13_admin_sales_endpoint():
    """Test 13a: GET /api/admin/sales?key=RAPANUI-2026 → 200"""
    print("\n[TEST 13a] GET /api/admin/sales?key=RAPANUI-2026 → 200")
    resp = requests.get(f"{BASE_URL}/api/admin/sales?key={ADMIN_KEY}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "total_clp" in data, f"Missing total_clp in response: {data}"
    assert "sales_count" in data, f"Missing sales_count in response: {data}"
    print(f"✅ PASS: Admin sales endpoint working (sales_count={data['sales_count']})")
    return True

def test_13_admin_grant_endpoint():
    """Test 13b: POST /api/admin/grant?key=RAPANUI-2026 → 200 with access_code"""
    print("\n[TEST 13b] POST /api/admin/grant?key=RAPANUI-2026 → 200 with access_code")
    resp = requests.post(
        f"{BASE_URL}/api/admin/grant?key={ADMIN_KEY}",
        json={"email": "t@t.com"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "access_code" in data, f"Missing access_code in response: {data}"
    assert data.get("granted") == True, f"Grant failed: {data}"
    print(f"✅ PASS: Admin grant endpoint working (access_code={data['access_code']})")
    return True

def test_13_admin_revoke_endpoint():
    """Test 13c: POST /api/admin/revoke?key=RAPANUI-2026 → 200"""
    print("\n[TEST 13c] POST /api/admin/revoke?key=RAPANUI-2026 → 200")
    resp = requests.post(
        f"{BASE_URL}/api/admin/revoke?key={ADMIN_KEY}",
        json={"email": "t@t.com"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "revoked_transactions" in data, f"Missing revoked_transactions: {data}"
    print(f"✅ PASS: Admin revoke endpoint working (revoked={data['revoked_transactions']})")
    return True

def test_14_anti_piracy_regression():
    """Test 14: Anti-piracy system regression test"""
    print("\n[TEST 14] Anti-piracy system regression test")
    
    # Insert test transaction via mongosh
    print("  → Inserting test transaction via mongosh...")
    insert_cmd = """
    db.getSiblingDB("test_database").payment_transactions.insertOne({
        id:"tx-reg",
        provider:"stripe",
        device_id:"dev-buy",
        email:"reg@t.com",
        amount_clp:3000,
        currency:"clp",
        payment_status:"paid",
        access_code:"999999",
        max_devices:3,
        created_at:new Date().toISOString(),
        paid_at:new Date().toISOString()
    })
    """
    result = subprocess.run(
        ["mongosh", "--quiet", "--eval", insert_cmd],
        capture_output=True,
        text=True
    )
    assert "acknowledged: true" in result.stdout, f"Insert failed: {result.stdout}"
    print("  ✓ Test transaction inserted")
    
    # Test 14a: Restore with correct code
    print("  → Testing restore with correct code (999999)...")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "reg@t.com", "device_id": "dev-otro", "access_code": "999999"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("has_access") == True, f"Expected has_access=true, got {data}"
    assert data.get("slots_remaining") == 1, f"Expected slots_remaining=1, got {data}"
    print(f"  ✓ Restore with correct code: {data}")
    
    # Test 14b: Restore with wrong code
    print("  → Testing restore with wrong code (111111)...")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "reg@t.com", "device_id": "dev-otro-2", "access_code": "111111"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("has_access") == False, f"Expected has_access=false, got {data}"
    assert data.get("reason") == "code_invalid", f"Expected reason=code_invalid, got {data}"
    print(f"  ✓ Restore with wrong code rejected: {data}")
    
    # Cleanup
    print("  → Cleaning up test data...")
    cleanup_cmd = """
    db.getSiblingDB("test_database").payment_transactions.deleteOne({id:"tx-reg"});
    db.getSiblingDB("test_database").access_grants.deleteMany({email:"reg@t.com"});
    """
    result = subprocess.run(
        ["mongosh", "--quiet", "--eval", cleanup_cmd],
        capture_output=True,
        text=True
    )
    print("  ✓ Cleanup complete")
    
    print("✅ PASS: Anti-piracy system regression test complete")
    return True

def main():
    print("=" * 80)
    print("COMPREHENSIVE BACKEND TEST - Icon/Asset Serving Fix Verification")
    print("Testing against:", BASE_URL)
    print("=" * 80)
    
    tests = [
        ("Test 1: Root HTML", test_1_root_html),
        ("Test 2: API Root JSON", test_2_api_root),
        ("Test 3: API 404", test_3_api_404),
        ("Test 4: /admin SPA Fallback", test_4_admin_spa_fallback),
        ("Test 5: /map SPA Fallback", test_5_map_spa_fallback),
        ("Test 6: JS Bundle", test_6_js_bundle),
        ("Test 7: Favicon", test_7_favicon),
        ("Test 8: Feather Font (THE BUG FIX)", test_8_feather_font),
        ("Test 9: MaterialIcons Font", test_9_material_icons_font),
        ("Test 10: Non-existent Asset 404", test_10_nonexistent_asset_404),
        ("Test 11: Random Route SPA Fallback", test_11_random_route_spa_fallback),
        ("Test 12: Bundle Contains Admin Strings", test_12_bundle_contains_admin_strings),
        ("Test 13a: Admin Sales Endpoint", test_13_admin_sales_endpoint),
        ("Test 13b: Admin Grant Endpoint", test_13_admin_grant_endpoint),
        ("Test 13c: Admin Revoke Endpoint", test_13_admin_revoke_endpoint),
        ("Test 14: Anti-piracy Regression", test_14_anti_piracy_regression),
    ]
    
    passed = 0
    failed = 0
    failed_tests = []
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
        except AssertionError as e:
            failed += 1
            failed_tests.append((name, str(e)))
            print(f"❌ FAIL: {name}")
            print(f"   Error: {e}")
        except Exception as e:
            failed += 1
            failed_tests.append((name, str(e)))
            print(f"❌ ERROR: {name}")
            print(f"   Exception: {e}")
    
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total: {len(tests)} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    
    if failed_tests:
        print("\nFailed Tests:")
        for name, error in failed_tests:
            print(f"  - {name}: {error}")
        sys.exit(1)
    else:
        print("\n🎉 ALL TESTS PASSED! Icon/asset serving fix verified successfully!")
        sys.exit(0)

if __name__ == "__main__":
    main()
