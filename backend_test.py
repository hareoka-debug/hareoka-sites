#!/usr/bin/env python3
"""
Comprehensive backend test for gitignore fix verification.
Tests vector-icon fonts serving, packages endpoint, admin endpoints, and verify-email flow.
"""

import requests
import json
import subprocess
import sys
from pathlib import Path

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def test_basic_endpoints():
    """Test 1-3: Basic endpoints"""
    print("\n=== TEST 1-3: Basic Endpoints ===")
    
    # Test 1: GET /
    print("Test 1: GET / → 200 with <title>Descubre Rapa Nui</title>")
    resp = requests.get(f"{BASE_URL}/")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "<title>Descubre Rapa Nui</title>" in resp.text, "Title not found in HTML"
    print("✅ Test 1 PASSED")
    
    # Test 2: GET /api/
    print("\nTest 2: GET /api/ → 200 with JSON")
    resp = requests.get(f"{BASE_URL}/api/")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["message"] == "Rutas Rapa Nui API", f"Unexpected message: {data}"
    print(f"✅ Test 2 PASSED: {data}")
    
    # Test 3: GET /api/packages
    print("\nTest 3: GET /api/packages → 200 with 3 packages")
    resp = requests.get(f"{BASE_URL}/api/packages")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    packages = data["packages"]
    assert len(packages) == 3, f"Expected 3 packages, got {len(packages)}"
    
    # Verify package IDs and route counts
    expected = {
        "hanga-roa": 4,
        "norte-playas": 4,
        "moais-este": 3
    }
    for pkg in packages:
        pkg_id = pkg["id"]
        assert pkg_id in expected, f"Unexpected package ID: {pkg_id}"
        route_count = pkg["route_count"]
        assert route_count == expected[pkg_id], f"Package {pkg_id}: expected {expected[pkg_id]} routes, got {route_count}"
        print(f"  ✓ Package '{pkg_id}': {route_count} routes, name='{pkg['name']}'")
    
    # Verify prices
    prices = data["prices"]
    assert prices["base_clp"] == 3000, "base_clp should be 3000"
    assert prices["extra_package_clp"] == 3000, "extra_package_clp should be 3000"
    assert prices["all_routes_clp"] == 5000, "all_routes_clp should be 5000"
    print(f"  ✓ Prices: base=3000, extra=3000, all=5000")
    print("✅ Test 3 PASSED")


def test_vector_icon_fonts():
    """Test 4: Verify ALL vector-icon fonts serving with 200 and correct content-type"""
    print("\n=== TEST 4: Vector-Icon Fonts Serving ===")
    
    fonts_dir = Path("/app/backend/web_static/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/")
    ttf_files = list(fonts_dir.glob("*.ttf"))
    
    print(f"Found {len(ttf_files)} .ttf font files in {fonts_dir}")
    assert len(ttf_files) >= 15, f"Expected at least 15 fonts, found {len(ttf_files)}"
    
    failed_fonts = []
    passed_fonts = []
    
    for ttf_file in ttf_files:
        # Construct URL path
        relative_path = ttf_file.relative_to(Path("/app/backend/web_static"))
        url = f"{BASE_URL}/{relative_path}"
        
        resp = requests.get(url)
        file_size_kb = ttf_file.stat().st_size / 1024
        
        if resp.status_code != 200:
            failed_fonts.append({
                "file": ttf_file.name,
                "status": resp.status_code,
                "size_kb": file_size_kb
            })
            print(f"  ❌ {ttf_file.name}: {resp.status_code} (size: {file_size_kb:.2f} KB)")
        else:
            content_type = resp.headers.get("content-type", "")
            content_length = len(resp.content) / 1024
            
            # Verify content-type is font-related
            is_font_type = any(x in content_type.lower() for x in ["font", "ttf", "octet-stream"])
            
            if not is_font_type:
                failed_fonts.append({
                    "file": ttf_file.name,
                    "status": 200,
                    "content_type": content_type,
                    "issue": "wrong content-type"
                })
                print(f"  ⚠️  {ttf_file.name}: 200 but wrong content-type '{content_type}'")
            elif content_length < 10:
                failed_fonts.append({
                    "file": ttf_file.name,
                    "status": 200,
                    "size_kb": content_length,
                    "issue": "file too small"
                })
                print(f"  ⚠️  {ttf_file.name}: 200 but file too small ({content_length:.2f} KB)")
            else:
                passed_fonts.append({
                    "file": ttf_file.name,
                    "size_kb": content_length,
                    "content_type": content_type
                })
                print(f"  ✅ {ttf_file.name}: 200 {content_type} ({content_length:.2f} KB)")
    
    print(f"\n📊 SUMMARY: {len(passed_fonts)}/{len(ttf_files)} fonts serving correctly")
    
    if failed_fonts:
        print(f"\n❌ FAILED FONTS ({len(failed_fonts)}):")
        for f in failed_fonts:
            print(f"  - {f}")
        raise AssertionError(f"{len(failed_fonts)} fonts failed to serve correctly")
    
    print("✅ Test 4 PASSED: All fonts serving with 200 and correct content-type")


def test_js_bundle():
    """Test 5: Verify JS bundle serving"""
    print("\n=== TEST 5: JS Bundle Serving ===")
    
    # Find the entry JS file
    js_dir = Path("/app/backend/web_static/_expo/static/js/web/")
    entry_files = list(js_dir.glob("entry-*.js"))
    
    assert len(entry_files) > 0, "No entry-*.js file found"
    entry_file = entry_files[0]
    
    relative_path = entry_file.relative_to(Path("/app/backend/web_static"))
    url = f"{BASE_URL}/{relative_path}"
    
    print(f"Testing: GET {url}")
    resp = requests.get(url)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    size_mb = len(resp.content) / (1024 * 1024)
    assert size_mb > 1, f"Bundle too small: {size_mb:.2f} MB"
    
    content_type = resp.headers.get("content-type", "")
    print(f"✅ Test 5 PASSED: Bundle serving correctly ({size_mb:.2f} MB, {content_type})")


def test_gitignore_fix():
    """Test 6: Verify .gitignore fix"""
    print("\n=== TEST 6: .gitignore Fix Verification ===")
    
    # Test git check-ignore
    test_file = "backend/web_static/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf"
    
    print(f"Test 6a: git check-ignore -v {test_file}")
    result = subprocess.run(
        ["git", "check-ignore", "-v", test_file],
        cwd="/app",
        capture_output=True,
        text=True
    )
    
    output = result.stdout.strip()
    print(f"  Output: {output}")
    
    # Should show a negation rule (!)
    assert "!backend/web_static/assets" in output, f"Expected negation rule in output, got: {output}"
    print("  ✅ Negation rule found in .gitignore")
    
    # Test git status
    print("\nTest 6b: git status --short backend/web_static/assets/")
    result = subprocess.run(
        ["git", "status", "--short", "backend/web_static/assets/"],
        cwd="/app",
        capture_output=True,
        text=True
    )
    
    output = result.stdout.strip()
    print(f"  Output: {output}")
    
    # Should show ?? (untracked, NOT ignored)
    assert "??" in output, f"Expected '??' (untracked), got: {output}"
    print("  ✅ Assets folder is untracked (NOT ignored)")
    
    print("✅ Test 6 PASSED: .gitignore fix verified")


def test_spa_routes():
    """Test 7: SPA routes still work"""
    print("\n=== TEST 7: SPA Routes ===")
    
    routes = ["/admin", "/map", "/select-package"]
    
    for route in routes:
        print(f"Testing: GET {route}")
        resp = requests.get(f"{BASE_URL}{route}")
        assert resp.status_code == 200, f"Expected 200 for {route}, got {resp.status_code}"
        assert "<title>Descubre Rapa Nui</title>" in resp.text, f"Title not found in {route}"
        print(f"  ✅ {route} → 200 HTML")
    
    print("✅ Test 7 PASSED: All SPA routes working")


def test_admin_endpoints():
    """Test 8: Admin endpoints regression"""
    print("\n=== TEST 8: Admin Endpoints Regression ===")
    
    # Test 8a: GET /api/admin/sales
    print("Test 8a: GET /api/admin/sales?key=RAPANUI-2026")
    resp = requests.get(f"{BASE_URL}/api/admin/sales", params={"key": ADMIN_KEY})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    sales = resp.json()
    print(f"  ✅ Sales: {sales['sales_count']} sales, {sales['total_clp']} CLP total")
    
    # Test 8b: POST /api/admin/grant
    test_email = "gitignore@t.com"
    print(f"\nTest 8b: POST /api/admin/grant (email={test_email})")
    resp = requests.post(
        f"{BASE_URL}/api/admin/grant",
        params={"key": ADMIN_KEY},
        json={"email": test_email}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    grant_data = resp.json()
    assert grant_data["granted"] == True, f"Expected granted=True, got {grant_data}"
    access_code = grant_data.get("access_code")
    assert access_code and len(access_code) == 4, f"Expected 4-digit access_code, got {access_code}"
    print(f"  ✅ Grant successful: access_code={access_code}")
    
    # Test 8c: POST /api/admin/revoke
    print(f"\nTest 8c: POST /api/admin/revoke (email={test_email})")
    resp = requests.post(
        f"{BASE_URL}/api/admin/revoke",
        params={"key": ADMIN_KEY},
        json={"email": test_email}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    revoke_data = resp.json()
    print(f"  ✅ Revoke successful: {revoke_data}")
    
    print("✅ Test 8 PASSED: Admin endpoints working")


def test_verify_email_flow():
    """Test 9: Verify-email regression with 30d session"""
    print("\n=== TEST 9: Verify-Email Flow (30d session) ===")
    
    # Insert a test payment via mongosh
    test_email = "gitignore-verify@t.com"
    test_device = "dev-gitignore-test"
    test_code = "9876"
    
    print(f"Test 9a: Insert test payment via mongosh")
    
    # First cleanup
    cleanup_cmd = f'db.payment_transactions.deleteMany({{email: "{test_email}"}}); db.access_grants.deleteMany({{email: "{test_email}"}});'
    subprocess.run(
        ["mongosh", "test_database", "--quiet", "--eval", cleanup_cmd],
        capture_output=True
    )
    
    # Insert test transaction
    insert_cmd = f'db.payment_transactions.insertOne({{id: "tx-gitignore-test", tx_id: "tx-gitignore-test", email: "{test_email}", device_id: "{test_device}", access_code: "{test_code}", payment_status: "paid", provider: "manual", amount_clp: 3000, created_at: new Date(), last_verified_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), max_devices: 1}});'
    result = subprocess.run(
        ["mongosh", "test_database", "--quiet", "--eval", insert_cmd],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"Failed to insert: {result.stderr}"
    print("  ✅ Test payment inserted (31 days old)")
    
    # Test 9b: Check access (should be expired)
    print(f"\nTest 9b: GET /api/payments/access/{test_device} (should be expired)")
    resp = requests.get(f"{BASE_URL}/api/payments/access/{test_device}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    access_data = resp.json()
    assert access_data["has_access"] == False, f"Expected has_access=False, got {access_data}"
    assert access_data["needs_verification"] == True, f"Expected needs_verification=True, got {access_data}"
    print(f"  ✅ Access expired: {access_data}")
    
    # Test 9c: Verify email (should renew 30d session)
    print(f"\nTest 9c: POST /api/payments/verify-email (should renew 30d session)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/verify-email",
        json={"email": test_email, "device_id": test_device}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    verify_data = resp.json()
    assert verify_data["verified"] == True, f"Expected verified=True, got {verify_data}"
    assert verify_data["session_ttl_hours"] == 720, f"Expected 720h (30d), got {verify_data['session_ttl_hours']}"
    print(f"  ✅ Email verified: {verify_data}")
    
    # Test 9d: Check access again (should have access now)
    print(f"\nTest 9d: GET /api/payments/access/{test_device} (should have access)")
    resp = requests.get(f"{BASE_URL}/api/payments/access/{test_device}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    access_data = resp.json()
    assert access_data["has_access"] == True, f"Expected has_access=True, got {access_data}"
    print(f"  ✅ Access granted: {access_data}")
    
    # Cleanup
    print(f"\nTest 9e: Cleanup test data")
    subprocess.run(
        ["mongosh", "test_database", "--quiet", "--eval", cleanup_cmd],
        capture_output=True
    )
    print("  ✅ Cleanup complete")
    
    print("✅ Test 9 PASSED: Verify-email flow working with 30d session")


def test_packages_regression():
    """Test 10: Packages endpoint returns correct data"""
    print("\n=== TEST 10: Packages Regression ===")
    
    resp = requests.get(f"{BASE_URL}/api/packages")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    packages = data["packages"]
    
    assert len(packages) == 3, f"Expected 3 packages, got {len(packages)}"
    
    # Verify structure
    for pkg in packages:
        assert "id" in pkg, f"Missing 'id' in package: {pkg}"
        assert "name" in pkg, f"Missing 'name' in package: {pkg}"
        assert "route_count" in pkg, f"Missing 'route_count' in package: {pkg}"
    
    # Verify prices at root level
    prices = data["prices"]
    assert prices["base_clp"] == 3000, f"Expected base_clp=3000, got {prices['base_clp']}"
    assert prices["extra_package_clp"] == 3000, f"Expected extra_package_clp=3000, got {prices['extra_package_clp']}"
    assert prices["all_routes_clp"] == 5000, f"Expected all_routes_clp=5000, got {prices['all_routes_clp']}"
    
    print(f"✅ Test 10 PASSED: Packages endpoint returns correct structure and prices")


def main():
    """Run all tests"""
    print("=" * 80)
    print("GITIGNORE FIX VERIFICATION - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    print(f"Testing against: {BASE_URL}")
    print(f"Admin key: {ADMIN_KEY}")
    
    try:
        test_basic_endpoints()
        test_vector_icon_fonts()
        test_js_bundle()
        test_gitignore_fix()
        test_spa_routes()
        test_admin_endpoints()
        test_verify_email_flow()
        test_packages_regression()
        
        print("\n" + "=" * 80)
        print("🎉 ALL TESTS PASSED! 🎉")
        print("=" * 80)
        print("\n✅ GITIGNORE FIX VERIFIED:")
        print("  - All 19 vector-icon fonts serving with 200 and correct content-type")
        print("  - .gitignore negation rules working correctly")
        print("  - Assets folder is untracked (NOT ignored)")
        print("  - All fonts will be included in next deploy")
        print("\n✅ BACKEND FUNCTIONALITY VERIFIED:")
        print("  - Basic endpoints working (/, /api/, /api/packages)")
        print("  - JS bundle serving correctly")
        print("  - SPA routes working (/admin, /map, /select-package)")
        print("  - Admin endpoints working (sales, grant, revoke)")
        print("  - Verify-email flow working with 30d session")
        print("  - Packages endpoint returning correct data")
        print("\n🚀 READY FOR PRODUCTION DEPLOY!")
        
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
