#!/usr/bin/env python3
"""
Backend test suite for "Descubre Rapa Nui" - Package System with 30-day sessions
Tests the new package-based system with 3 route packages, email-only verification,
and 30-day session TTL.
"""
import requests
import json
import sys
import subprocess
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def mongosh_exec(cmd):
    """Execute mongosh command"""
    result = subprocess.run(
        ["mongosh", "--quiet", "--eval", cmd],
        capture_output=True,
        text=True,
        timeout=10
    )
    return result.stdout.strip()

def test_1_get_packages():
    """Test 1: GET /api/packages → 200 with 3 packages"""
    print("\n[Test 1] GET /api/packages → Verify 3 packages with correct structure")
    resp = requests.get(f"{BASE_URL}/api/packages", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert "packages" in data, f"Missing 'packages' key: {data}"
    assert "prices" in data, f"Missing 'prices' key: {data}"
    
    packages = data["packages"]
    assert len(packages) == 3, f"Expected 3 packages, got {len(packages)}"
    
    # Verify package IDs and route counts
    pkg_ids = {p["id"]: p for p in packages}
    assert "hanga-roa" in pkg_ids, "Missing 'hanga-roa' package"
    assert "norte-playas" in pkg_ids, "Missing 'norte-playas' package"
    assert "moais-este" in pkg_ids, "Missing 'moais-este' package"
    
    assert pkg_ids["hanga-roa"]["route_count"] == 4, f"hanga-roa should have 4 routes, got {pkg_ids['hanga-roa']['route_count']}"
    assert pkg_ids["norte-playas"]["route_count"] == 4, f"norte-playas should have 4 routes, got {pkg_ids['norte-playas']['route_count']}"
    assert pkg_ids["moais-este"]["route_count"] == 3, f"moais-este should have 3 routes, got {pkg_ids['moais-este']['route_count']}"
    
    # Verify prices
    prices = data["prices"]
    assert prices["base_clp"] == 3000, f"Expected base_clp=3000, got {prices['base_clp']}"
    assert prices["extra_package_clp"] == 3000, f"Expected extra_package_clp=3000, got {prices['extra_package_clp']}"
    assert prices["all_routes_clp"] == 5000, f"Expected all_routes_clp=5000, got {prices['all_routes_clp']}"
    
    print(f"  ✅ 3 packages found: hanga-roa (4 routes), norte-playas (4 routes), moais-este (3 routes)")
    print(f"  ✅ Prices: base=3000, extra_package=3000, all_routes=5000")
    print("  ✅ Test 1 PASSED")
    return True


def test_2_insert_30day_transaction():
    """Test 2: Insert transaction with recent last_verified_at"""
    print("\n[Test 2] Insert test transaction with recent last_verified_at")
    cmd = '''db.getSiblingDB("test_database").payment_transactions.insertOne({
        id:"tx-30d",
        provider:"stripe",
        device_id:"dev-p1",
        email:"p1@t.com",
        amount_clp:3000,
        currency:"clp",
        payment_status:"paid",
        access_code:"1234",
        max_devices:1,
        created_at:new Date().toISOString(),
        paid_at:new Date().toISOString(),
        last_verified_at:new Date().toISOString()
    })'''
    result = mongosh_exec(cmd)
    assert "acknowledged: true" in result or "insertedId" in result, f"Insert failed: {result}"
    print("  ✅ Transaction tx-30d inserted successfully")
    print("  ✅ Test 2 PASSED")
    return True


def test_3_check_access_needs_package_selection():
    """Test 3: GET /api/payments/access/dev-p1 → has_access=true, needs_package_selection=true"""
    print("\n[Test 3] GET /api/payments/access/dev-p1 → Verify access with package selection needed")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("has_access") is True, f"Expected has_access=true, got {data}"
    assert data.get("needs_package_selection") is True, f"Expected needs_package_selection=true, got {data}"
    assert data.get("owned_packages") == [], f"Expected owned_packages=[], got {data.get('owned_packages')}"
    assert data.get("all_routes_unlocked") is False, f"Expected all_routes_unlocked=false, got {data}"
    
    print(f"  ✅ has_access=true, needs_package_selection=true, owned_packages=[], all_routes_unlocked=false")
    print("  ✅ Test 3 PASSED")
    return True


def test_4_simulate_15_days_elapsed():
    """Test 4: Simulate 15 days elapsed (session still valid)"""
    print("\n[Test 4] Simulate 15 days elapsed (session still valid < 30d)")
    cmd = '''const d15=new Date(Date.now()-15*24*3600*1000).toISOString(); 
db.getSiblingDB("test_database").payment_transactions.updateOne(
    {id:"tx-30d"},
    {$set:{last_verified_at:d15}}
)'''
    result = mongosh_exec(cmd)
    assert "modifiedCount: 1" in result or "matchedCount: 1" in result, f"Update failed: {result}"
    print("  ✅ last_verified_at set to 15 days ago")
    print("  ✅ Test 4 PASSED")
    return True


def test_5_check_access_15days_valid():
    """Test 5: GET /api/payments/access/dev-p1 → has_access=true (15d < 30d)"""
    print("\n[Test 5] GET /api/payments/access/dev-p1 → Verify session still valid after 15 days")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("has_access") is True, f"Expected has_access=true after 15 days, got {data}"
    print(f"  ✅ has_access=true (session valid: 15 days < 30 days)")
    print("  ✅ Test 5 PASSED")
    return True


def test_6_simulate_31_days_elapsed():
    """Test 6: Simulate 31 days elapsed (session expired)"""
    print("\n[Test 6] Simulate 31 days elapsed (session expired > 30d)")
    cmd = '''const d31=new Date(Date.now()-31*24*3600*1000).toISOString(); 
db.getSiblingDB("test_database").payment_transactions.updateOne(
    {id:"tx-30d"},
    {$set:{last_verified_at:d31, paid_at:d31}}
)'''
    result = mongosh_exec(cmd)
    assert "modifiedCount: 1" in result or "matchedCount: 1" in result, f"Update failed: {result}"
    print("  ✅ last_verified_at and paid_at set to 31 days ago")
    print("  ✅ Test 6 PASSED")
    return True


def test_7_check_access_31days_expired():
    """Test 7: GET /api/payments/access/dev-p1 → has_access=false, needs_verification=true"""
    print("\n[Test 7] GET /api/payments/access/dev-p1 → Verify session expired after 31 days")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("has_access") is False, f"Expected has_access=false after 31 days, got {data}"
    assert data.get("needs_verification") is True, f"Expected needs_verification=true, got {data}"
    assert data.get("email") == "p1@t.com", f"Expected email=p1@t.com, got {data.get('email')}"
    
    print(f"  ✅ has_access=false, needs_verification=true, email=p1@t.com")
    print("  ✅ Test 7 PASSED")
    return True


def test_8_verify_email_correct():
    """Test 8: POST /api/payments/verify-email with correct email"""
    print("\n[Test 8] POST /api/payments/verify-email → Verify with correct email (no code)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/verify-email",
        json={"device_id": "dev-p1", "email": "p1@t.com"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("verified") is True, f"Expected verified=true, got {data}"
    assert data.get("reason") == "purchaser", f"Expected reason=purchaser, got {data.get('reason')}"
    assert data.get("session_ttl_hours") == 720, f"Expected session_ttl_hours=720, got {data.get('session_ttl_hours')}"
    
    print(f"  ✅ verified=true, reason=purchaser, session_ttl_hours=720")
    print("  ✅ Test 8 PASSED - Session renewed for 30 days")
    return True


def test_9_verify_email_wrong():
    """Test 9: POST /api/payments/verify-email with wrong email"""
    print("\n[Test 9] POST /api/payments/verify-email → Verify with wrong email")
    resp = requests.post(
        f"{BASE_URL}/api/payments/verify-email",
        json={"device_id": "dev-p1", "email": "otro@t.com"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("verified") is False, f"Expected verified=false, got {data}"
    assert data.get("reason") == "no_payment", f"Expected reason=no_payment, got {data.get('reason')}"
    
    print(f"  ✅ verified=false, reason=no_payment")
    print("  ✅ Test 9 PASSED")
    return True


def test_10_verify_email_wrong_device():
    """Test 10: POST /api/payments/verify-email from different device"""
    print("\n[Test 10] POST /api/payments/verify-email → Verify from different device")
    resp = requests.post(
        f"{BASE_URL}/api/payments/verify-email",
        json={"device_id": "dev-p1-otro", "email": "p1@t.com"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("verified") is False, f"Expected verified=false, got {data}"
    assert data.get("reason") == "wrong_device", f"Expected reason=wrong_device, got {data.get('reason')}"
    assert "otro dispositivo" in data.get("message", "").lower(), f"Expected 'otro dispositivo' in message, got {data.get('message')}"
    
    print(f"  ✅ verified=false, reason=wrong_device")
    print(f"  ✅ message: {data.get('message')}")
    print("  ✅ Test 10 PASSED - Different device blocked")
    return True


def test_11_select_package():
    """Test 11: POST /api/payments/select-package → Select first package"""
    print("\n[Test 11] POST /api/payments/select-package → Select 'hanga-roa' package")
    resp = requests.post(
        f"{BASE_URL}/api/payments/select-package",
        json={"device_id": "dev-p1", "email": "p1@t.com", "package_id": "hanga-roa"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("selected") == "hanga-roa", f"Expected selected=hanga-roa, got {data}"
    assert data.get("owned_packages") == ["hanga-roa"], f"Expected owned_packages=['hanga-roa'], got {data.get('owned_packages')}"
    
    print(f"  ✅ selected=hanga-roa, owned_packages=['hanga-roa']")
    print("  ✅ Test 11 PASSED")
    return True


def test_12_select_package_again():
    """Test 12: POST /api/payments/select-package → Try to select another package"""
    print("\n[Test 12] POST /api/payments/select-package → Try to select 'norte-playas' (should fail)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/select-package",
        json={"device_id": "dev-p1", "email": "p1@t.com", "package_id": "norte-playas"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("already_selected") is True, f"Expected already_selected=true, got {data}"
    assert data.get("owned_packages") == ["hanga-roa"], f"Expected owned_packages=['hanga-roa'], got {data.get('owned_packages')}"
    
    print(f"  ✅ already_selected=true, owned_packages=['hanga-roa'] (unchanged)")
    print("  ✅ Test 12 PASSED - Cannot change package selection")
    return True


def test_13_check_access_after_selection():
    """Test 13: GET /api/payments/access/dev-p1 → Verify package selected"""
    print("\n[Test 13] GET /api/payments/access/dev-p1 → Verify after package selection")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("owned_packages") == ["hanga-roa"], f"Expected owned_packages=['hanga-roa'], got {data.get('owned_packages')}"
    assert data.get("needs_package_selection") is False, f"Expected needs_package_selection=false, got {data}"
    assert data.get("all_routes_unlocked") is False, f"Expected all_routes_unlocked=false, got {data}"
    
    print(f"  ✅ owned_packages=['hanga-roa'], needs_package_selection=false, all_routes_unlocked=false")
    print("  ✅ Test 13 PASSED")
    return True


def test_14_upgrade_extra_package():
    """Test 14: POST /api/payments/upgrade-checkout → Upgrade to extra package"""
    print("\n[Test 14] POST /api/payments/upgrade-checkout → Upgrade to 'norte-playas' package")
    resp = requests.post(
        f"{BASE_URL}/api/payments/upgrade-checkout",
        json={
            "device_id": "dev-p1",
            "email": "p1@t.com",
            "kind": "package",
            "package_id": "norte-playas",
            "provider": "mercadopago",
            "origin_url": "http://localhost:8001"
        },
        timeout=10
    )
    
    # May fail with 503 if MP not configured, or 502 if MP API call fails
    if resp.status_code in (502, 503):
        data = resp.json()
        detail = data.get("detail", "")
        assert "MP" in detail or "Mercado Pago" in detail, f"Expected MP-related error, got {data}"
        print(f"  ⚠️  {resp.status_code} Error: {detail[:100]}")
        print("  ✅ Test 14 PASSED - Error message is clear (MP not configured or API error)")
        return True
    
    assert resp.status_code == 200, f"Expected 200, 502, or 503, got {resp.status_code}"
    data = resp.json()
    assert "url" in data, f"Missing 'url' in response: {data}"
    assert "tx_id" in data, f"Missing 'tx_id' in response: {data}"
    print(f"  ✅ Upgrade checkout created: tx_id={data.get('tx_id')}")
    print("  ✅ Test 14 PASSED")
    return True


def test_15_upgrade_invalid_package():
    """Test 15: POST /api/payments/upgrade-checkout → Invalid package"""
    print("\n[Test 15] POST /api/payments/upgrade-checkout → Try invalid package")
    resp = requests.post(
        f"{BASE_URL}/api/payments/upgrade-checkout",
        json={
            "device_id": "dev-p1",
            "email": "p1@t.com",
            "kind": "package",
            "package_id": "NO-EXISTE",
            "provider": "mercadopago",
            "origin_url": "http://localhost:8001"
        },
        timeout=10
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    data = resp.json()
    assert "Paquete inválido" in data.get("detail", ""), f"Expected 'Paquete inválido', got {data}"
    
    print(f"  ✅ 400 Bad Request: {data.get('detail')}")
    print("  ✅ Test 15 PASSED")
    return True


def test_16_upgrade_no_base_payment():
    """Test 16: POST /api/payments/upgrade-checkout → No base payment"""
    print("\n[Test 16] POST /api/payments/upgrade-checkout → Try upgrade without base payment")
    resp = requests.post(
        f"{BASE_URL}/api/payments/upgrade-checkout",
        json={
            "device_id": "dev-NO-PAY",
            "email": "nope@t.com",
            "kind": "all",
            "provider": "mercadopago",
            "origin_url": "http://localhost:8001"
        },
        timeout=10
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    data = resp.json()
    assert "Necesitas la compra base primero" in data.get("detail", ""), f"Expected 'Necesitas la compra base primero', got {data}"
    
    print(f"  ✅ 403 Forbidden: {data.get('detail')}")
    print("  ✅ Test 16 PASSED")
    return True


def test_17_simulate_upgrade_all():
    """Test 17: Simulate upgrade 'all' completed"""
    print("\n[Test 17] Simulate upgrade 'all' completed → Insert and mark paid")
    
    # Insert upgrade transaction
    cmd1 = '''db.getSiblingDB("test_database").payment_transactions.insertOne({
        id:"up-all-1",
        provider:"mercadopago",
        device_id:"dev-p1",
        email:"p1@t.com",
        amount_clp:5000,
        currency:"clp",
        payment_status:"pending",
        kind:"upgrade",
        upgrade_kind:"all",
        parent_tx:"tx-30d",
        created_at:new Date().toISOString(),
        session_id:"mock-session-all-1",
        mp_preference_id:"mock-pref-all-1"
    })'''
    result1 = mongosh_exec(cmd1)
    assert "acknowledged: true" in result1 or "insertedId" in result1, f"Insert failed: {result1}"
    print("  ✅ Upgrade transaction up-all-1 inserted")
    
    # Mark as paid
    cmd2 = '''db.getSiblingDB("test_database").payment_transactions.updateOne(
        {id:"up-all-1"},
        {$set:{payment_status:"paid", paid_at:new Date().toISOString()}}
    )'''
    result2 = mongosh_exec(cmd2)
    assert "modifiedCount: 1" in result2 or "matchedCount: 1" in result2, f"Update failed: {result2}"
    print("  ✅ Upgrade transaction marked as paid")
    
    # Manually apply upgrade logic (since _mark_paid is not triggered by updateOne)
    cmd3 = '''const raffle_code = "RAPA-" + Math.random().toString(36).substring(2, 8).toUpperCase();
db.getSiblingDB("test_database").payment_transactions.updateOne(
    {id:"tx-30d"},
    {$set:{
        owned_packages:["hanga-roa","norte-playas","moais-este"],
        all_routes_unlocked:true,
        raffle_participating:true,
        raffle_code:raffle_code,
        raffle_registered_at:new Date().toISOString()
    }}
)'''
    result3 = mongosh_exec(cmd3)
    assert "modifiedCount: 1" in result3 or "matchedCount: 1" in result3, f"Update failed: {result3}"
    print("  ✅ Parent transaction updated with all packages + raffle")
    print("  ✅ Test 17 PASSED")
    return True


def test_18_check_access_all_unlocked():
    """Test 18: GET /api/payments/access/dev-p1 → Verify all routes unlocked"""
    print("\n[Test 18] GET /api/payments/access/dev-p1 → Verify all routes unlocked + raffle")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("all_routes_unlocked") is True, f"Expected all_routes_unlocked=true, got {data}"
    assert data.get("raffle_participating") is True, f"Expected raffle_participating=true, got {data}"
    assert len(data.get("owned_packages", [])) == 3, f"Expected 3 owned_packages, got {data.get('owned_packages')}"
    
    print(f"  ✅ all_routes_unlocked=true, raffle_participating=true")
    print(f"  ✅ owned_packages={data.get('owned_packages')}")
    print("  ✅ Test 18 PASSED")
    return True


def test_19_my_info():
    """Test 19: GET /api/payments/my-info/dev-p1 → Verify purchaser info"""
    print("\n[Test 19] GET /api/payments/my-info/dev-p1 → Verify purchaser info")
    resp = requests.get(f"{BASE_URL}/api/payments/my-info/dev-p1", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert len(data.get("owned_packages", [])) == 3, f"Expected 3 owned_packages, got {data.get('owned_packages')}"
    assert data.get("all_routes_unlocked") is True, f"Expected all_routes_unlocked=true, got {data}"
    assert data.get("raffle_participating") is True, f"Expected raffle_participating=true, got {data}"
    assert data.get("raffle_code") is not None, f"Expected raffle_code, got {data}"
    assert data.get("session_ttl_hours") == 720, f"Expected session_ttl_hours=720, got {data.get('session_ttl_hours')}"
    
    print(f"  ✅ owned_packages={data.get('owned_packages')}")
    print(f"  ✅ all_routes_unlocked=true, raffle_participating=true")
    print(f"  ✅ raffle_code={data.get('raffle_code')}, session_ttl_hours=720")
    print("  ✅ Test 19 PASSED")
    return True


def test_20_admin_grant():
    """Test 20: POST /api/admin/grant → Grant access"""
    print("\n[Test 20] POST /api/admin/grant → Grant access to testx@t.com")
    resp = requests.post(
        f"{BASE_URL}/api/admin/grant?key={ADMIN_KEY}",
        json={"email": "testx@t.com"},
        timeout=10
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    
    assert data.get("granted") is True, f"Expected granted=true, got {data}"
    access_code = data.get("access_code")
    assert access_code and len(access_code) == 4, f"Expected 4-char access_code, got {access_code}"
    
    print(f"  ✅ granted=true, access_code={access_code} (4 chars)")
    
    # Verify transaction exists
    resp2 = requests.get(f"{BASE_URL}/api/admin/transactions?key={ADMIN_KEY}&email=testx@t.com", timeout=10)
    assert resp2.status_code == 200, f"Expected 200, got {resp2.status_code}"
    data2 = resp2.json()
    assert data2.get("count") == 1, f"Expected count=1, got {data2}"
    tx = data2.get("items", [])[0]
    assert tx.get("provider") == "manual", f"Expected provider=manual, got {tx.get('provider')}"
    assert tx.get("payment_status") == "paid", f"Expected payment_status=paid, got {tx.get('payment_status')}"
    
    print(f"  ✅ Transaction verified: provider=manual, payment_status=paid")
    print("  ✅ Test 20 PASSED")
    return True


def test_21_static_assets():
    """Test 21: GET /assets/.../Feather.ttf → 200 font/ttf"""
    print("\n[Test 21] GET /assets/.../Feather.ttf → Verify static asset serving")
    font_path = "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf"
    resp = requests.get(f"{BASE_URL}{font_path}", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    content_type = resp.headers.get("content-type", "")
    assert "font/ttf" in content_type or "font" in content_type, f"Expected font/ttf, got {content_type}"
    
    print(f"  ✅ Feather.ttf served: {len(resp.content)/1024:.2f} KB, content-type: {content_type}")
    print("  ✅ Test 21 PASSED")
    return True


def test_22_spa_routes():
    """Test 22: Frontend SPA routes → 200 HTML"""
    print("\n[Test 22] Frontend SPA routes → Verify /select-package, /admin, /map")
    
    routes = ["/select-package", "/admin", "/map"]
    for route in routes:
        resp = requests.get(f"{BASE_URL}{route}", timeout=10)
        assert resp.status_code == 200, f"Expected 200 for {route}, got {resp.status_code}"
        assert "text/html" in resp.headers.get("content-type", ""), f"Expected text/html for {route}"
        print(f"  ✅ {route} → 200 HTML")
    
    print("  ✅ Test 22 PASSED")
    return True


def test_23_cleanup():
    """Test 23: Cleanup test data"""
    print("\n[Test 23] Cleanup test data")
    
    cmd1 = '''db.getSiblingDB("test_database").payment_transactions.deleteMany({
        email:{$in:["p1@t.com","testx@t.com"]}
    })'''
    result1 = mongosh_exec(cmd1)
    print(f"  ✅ Deleted transactions: {result1}")
    
    cmd2 = '''db.getSiblingDB("test_database").payment_transactions.deleteMany({
        parent_tx:"tx-30d"
    })'''
    result2 = mongosh_exec(cmd2)
    print(f"  ✅ Deleted upgrade transactions: {result2}")
    
    print("  ✅ Test 23 PASSED - Cleanup complete")
    return True


def main():
    """Run all tests"""
    print("=" * 80)
    print("DESCUBRE RAPA NUI - PACKAGE SYSTEM WITH 30-DAY SESSIONS TEST SUITE")
    print("=" * 80)
    print(f"Testing against: {BASE_URL}")
    print(f"Admin key: {ADMIN_KEY}")
    
    tests = [
        test_1_get_packages,
        test_2_insert_30day_transaction,
        test_3_check_access_needs_package_selection,
        test_4_simulate_15_days_elapsed,
        test_5_check_access_15days_valid,
        test_6_simulate_31_days_elapsed,
        test_7_check_access_31days_expired,
        test_8_verify_email_correct,
        test_9_verify_email_wrong,
        test_10_verify_email_wrong_device,
        test_11_select_package,
        test_12_select_package_again,
        test_13_check_access_after_selection,
        test_14_upgrade_extra_package,
        test_15_upgrade_invalid_package,
        test_16_upgrade_no_base_payment,
        test_17_simulate_upgrade_all,
        test_18_check_access_all_unlocked,
        test_19_my_info,
        test_20_admin_grant,
        test_21_static_assets,
        test_22_spa_routes,
        test_23_cleanup,
    ]
    
    passed = 0
    failed = 0
    failed_tests = []
    
    for test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"  ❌ FAILED: {e}")
            failed += 1
            failed_tests.append((test_func.__name__, str(e)))
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            failed += 1
            failed_tests.append((test_func.__name__, str(e)))
    
    print("\n" + "=" * 80)
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 80)
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for test_name, error in failed_tests:
            print(f"  - {test_name}: {error}")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED - Package system with 30-day sessions verified!")
        sys.exit(0)


if __name__ == "__main__":
    main()
