#!/usr/bin/env python3
"""
Backend test suite for "Descubre Rapa Nui" app post-rename verification.
Tests meta tags, SEO, Open Graph, and all backend functionality.
"""
import requests
import json
import sys
from pathlib import Path

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def test_1_root_html_with_meta_tags():
    """Test 1: GET / → 200 with HTML containing all required meta tags"""
    print("\n[Test 1] GET / → Verify HTML with meta tags")
    resp = requests.get(f"{BASE_URL}/", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "text/html" in resp.headers.get("content-type", ""), "Expected text/html"
    
    html = resp.text
    
    # Check title
    assert "<title>Descubre Rapa Nui</title>" in html, "Missing <title>Descubre Rapa Nui</title>"
    print("  ✅ <title>Descubre Rapa Nui</title> found")
    
    # Check application-name
    assert 'application-name" content="Descubre Rapa Nui"' in html, "Missing application-name meta tag"
    print('  ✅ application-name" content="Descubre Rapa Nui" found')
    
    # Check og:title
    assert 'og:title" content="Descubre Rapa Nui"' in html, "Missing og:title meta tag"
    print('  ✅ og:title" content="Descubre Rapa Nui" found')
    
    # Check og:description (should mention "Isla de Pascua" or "senderos")
    assert 'og:description" content=' in html, "Missing og:description meta tag"
    og_desc_start = html.find('og:description" content="')
    if og_desc_start != -1:
        og_desc_end = html.find('"', og_desc_start + 25)
        og_desc = html[og_desc_start + 25:og_desc_end]
        assert "Isla de Pascua" in og_desc or "senderos" in og_desc or "Rapa Nui" in og_desc, \
            f"og:description doesn't mention expected content: {og_desc}"
        print(f'  ✅ og:description found: "{og_desc[:60]}..."')
    
    # Check lang="es"
    assert '<html lang="es"' in html, 'Missing <html lang="es"'
    print('  ✅ <html lang="es" found')
    
    # Check theme-color
    assert 'theme-color" content="#B35D4A"' in html, "Missing theme-color meta tag"
    print('  ✅ theme-color" content="#B35D4A" found')
    
    print("  ✅ Test 1 PASSED: All meta tags present")
    return True


def test_2_api_root():
    """Test 2: GET /api/ → 200 with JSON message"""
    print("\n[Test 2] GET /api/ → Verify JSON response")
    resp = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("message") == "Rutas Rapa Nui API", f"Unexpected message: {data}"
    print(f'  ✅ Response: {data}')
    print("  ✅ Test 2 PASSED")
    return True


def test_3_api_routes():
    """Test 3: GET /api/routes → 200 with array"""
    print("\n[Test 3] GET /api/routes → Verify routes array")
    resp = requests.get(f"{BASE_URL}/api/routes", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    assert len(data) > 0, "Routes array is empty"
    print(f"  ✅ Received {len(data)} routes")
    print("  ✅ Test 3 PASSED")
    return True


def test_4_admin_spa_fallback():
    """Test 4: GET /admin → 200 with HTML (SPA fallback with meta tags)"""
    print("\n[Test 4] GET /admin → Verify SPA fallback with meta tags")
    resp = requests.get(f"{BASE_URL}/admin", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "text/html" in resp.headers.get("content-type", ""), "Expected text/html"
    
    html = resp.text
    assert "<title>Descubre Rapa Nui</title>" in html, "Missing title in /admin"
    assert 'og:title" content="Descubre Rapa Nui"' in html, "Missing og:title in /admin"
    print("  ✅ /admin serves HTML with meta tags (SPA fallback working)")
    print("  ✅ Test 4 PASSED")
    return True


def test_5_assets_feather_font():
    """Test 5: GET /assets/.../Feather.ttf → 200 font/ttf"""
    print("\n[Test 5] GET /assets/.../Feather.ttf → Verify font serving")
    
    # Find the actual Feather font path
    font_path = "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf"
    resp = requests.get(f"{BASE_URL}{font_path}", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    content_type = resp.headers.get("content-type", "")
    assert "font/ttf" in content_type or "font" in content_type, f"Expected font/ttf, got {content_type}"
    
    size_kb = len(resp.content) / 1024
    print(f"  ✅ Feather.ttf served: {size_kb:.2f} KB, content-type: {content_type}")
    print("  ✅ Test 5 PASSED")
    return True


def test_6_expo_js_bundle():
    """Test 6: GET /_expo/static/js/web/entry-*.js → 200 with size > 1MB"""
    print("\n[Test 6] GET /_expo/static/js/web/entry-*.js → Verify JS bundle")
    
    # Find the actual entry file
    entry_file = "entry-28637496496eedbdb0a91f47df4cc09c.js"
    resp = requests.get(f"{BASE_URL}/_expo/static/js/web/{entry_file}", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    size_mb = len(resp.content) / (1024 * 1024)
    assert size_mb > 1.0, f"Expected size > 1MB, got {size_mb:.2f} MB"
    print(f"  ✅ JS bundle served: {size_mb:.2f} MB")
    print("  ✅ Test 6 PASSED")
    return True


def test_7_admin_sales():
    """Test 7: GET /api/admin/sales?key=RAPANUI-2026 → 200"""
    print("\n[Test 7] GET /api/admin/sales → Verify admin endpoint")
    resp = requests.get(f"{BASE_URL}/api/admin/sales?key={ADMIN_KEY}", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "sales_count" in data, f"Missing sales_count in response: {data}"
    print(f"  ✅ Admin sales response: sales_count={data.get('sales_count')}, total_clp={data.get('total_clp')}")
    print("  ✅ Test 7 PASSED")
    return True


def test_8_admin_grant_revoke():
    """Test 8: POST /api/admin/grant + DELETE revoke flow"""
    print("\n[Test 8] POST /api/admin/grant + revoke → Verify grant/revoke flow")
    
    test_email = "rename@t.com"
    
    # Grant access
    print(f"  → Granting access to {test_email}")
    resp = requests.post(
        f"{BASE_URL}/api/admin/grant?key={ADMIN_KEY}",
        json={"email": test_email, "note": "Test rename verification"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("granted") is True, f"Grant failed: {data}"
    access_code = data.get("access_code")
    assert access_code, "No access_code returned"
    print(f"  ✅ Access granted: access_code={access_code}")
    
    # Revoke access
    print(f"  → Revoking access for {test_email}")
    resp = requests.post(
        f"{BASE_URL}/api/admin/revoke?key={ADMIN_KEY}",
        json={"email": test_email},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data.get("revoked_transactions", 0) > 0, f"Revoke failed: {data}"
    print(f"  ✅ Access revoked: {data}")
    print("  ✅ Test 8 PASSED")
    return True


def main():
    """Run all tests"""
    print("=" * 70)
    print("DESCUBRE RAPA NUI - POST-RENAME VERIFICATION TEST SUITE")
    print("=" * 70)
    print(f"Testing against: {BASE_URL}")
    
    tests = [
        test_1_root_html_with_meta_tags,
        test_2_api_root,
        test_3_api_routes,
        test_4_admin_spa_fallback,
        test_5_assets_feather_font,
        test_6_expo_js_bundle,
        test_7_admin_sales,
        test_8_admin_grant_revoke,
    ]
    
    passed = 0
    failed = 0
    
    for test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"  ❌ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 70)
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED - Rename verification complete!")
        sys.exit(0)


if __name__ == "__main__":
    main()
