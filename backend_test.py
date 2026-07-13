#!/usr/bin/env python3
"""
Test anti-piracy system: 6-digit access codes + 3 device limit
Tests against http://localhost:8001
"""
import requests
import json
import subprocess
import sys

BASE_URL = "http://localhost:8001"
ADMIN_KEY = "RAPANUI-2026"

def test(num, description):
    print(f"\n{'='*80}")
    print(f"TEST {num}: {description}")
    print('='*80)

def pass_test(msg=""):
    print(f"✅ PASS {msg}")

def fail_test(msg=""):
    print(f"❌ FAIL {msg}")
    
def cleanup():
    """Clean up test data from MongoDB"""
    print("\n" + "="*80)
    print("CLEANUP: Removing test data")
    print("="*80)
    
    emails = ["buyer@test.com", "real@test.com"]
    for email in emails:
        cmd = f'mongosh --quiet --eval \'db.getSiblingDB("test_database").payment_transactions.deleteMany({{email:"{email}"}})\''
        subprocess.run(cmd, shell=True, capture_output=True)
        cmd = f'mongosh --quiet --eval \'db.getSiblingDB("test_database").access_grants.deleteMany({{email:"{email}"}})\''
        subprocess.run(cmd, shell=True, capture_output=True)
    print("✅ Cleanup complete")

# Store test data
test_data = {}

try:
    # Test 1: Admin grant with access code
    test(1, "POST /api/admin/grant with buyer@test.com")
    resp = requests.post(
        f"{BASE_URL}/api/admin/grant",
        json={"email": "buyer@test.com", "note": "test"},
        params={"key": ADMIN_KEY}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("granted") and "access_code" in data:
            code = data["access_code"]
            if len(code) == 6 and code.isdigit():
                test_data["buyer_code"] = code
                test_data["buyer_tx_id"] = data.get("tx_id")
                pass_test(f"Access code: {code}")
            else:
                fail_test(f"Access code not 6 digits: {code}")
        else:
            fail_test(f"Missing granted or access_code in response")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 2: Verify transaction has correct fields
    test(2, "GET /api/admin/transactions?email=buyer@test.com")
    resp = requests.get(
        f"{BASE_URL}/api/admin/transactions",
        params={"key": ADMIN_KEY, "email": "buyer@test.com"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("count") > 0:
            tx = data["items"][0]
            checks = []
            checks.append(("provider", tx.get("provider") == "manual"))
            checks.append(("payment_status", tx.get("payment_status") == "paid"))
            
            all_pass = all(check[1] for check in checks)
            if all_pass:
                pass_test("Transaction has correct fields")
            else:
                fail_test(f"Field checks: {checks}")
        else:
            fail_test("No transactions found")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 3: Restore without code (manual grant should work)
    test(3, "POST /api/payments/restore without code (manual grant)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "buyer@test.com", "device_id": "dev-1"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("has_access") and data.get("reason") == "granted":
            pass_test("Manual grant allows restore without code")
        else:
            fail_test(f"Expected has_access=true, reason=granted, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 4: Check access for dev-1
    test(4, "GET /api/payments/access/dev-1")
    resp = requests.get(f"{BASE_URL}/api/payments/access/dev-1")
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("has_access") and data.get("email") == "buyer@test.com":
            pass_test("Device has access")
        else:
            fail_test(f"Expected has_access=true, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 5: Skip real payment (will fail with 502)
    test(5, "POST /api/payments/checkout (SKIPPED - will fail with 502)")
    print("⏭️  SKIPPED - Mercado Pago not configured, expected 502")

    # Test 6: Insert real paid transaction via mongosh
    test(6, "Insert real paid transaction via mongosh")
    mongo_cmd = '''mongosh --quiet --eval 'db.getSiblingDB("test_database").payment_transactions.insertOne({id:"tx-real",provider:"stripe",device_id:"dev-real-buyer",email:"real@test.com",amount_clp:3000,currency:"clp",payment_status:"paid",access_code:"123456",max_devices:3,created_at:new Date().toISOString(),paid_at:new Date().toISOString()})' '''
    result = subprocess.run(mongo_cmd, shell=True, capture_output=True, text=True)
    print(f"Mongo output: {result.stdout}")
    if result.returncode == 0 and "acknowledged" in result.stdout:
        pass_test("Transaction inserted")
    else:
        fail_test(f"Failed to insert: {result.stderr}")

    # Test 7: Restore without code (should fail for non-manual)
    test(7, "POST /api/payments/restore without code (non-manual, should fail)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-1"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if not data.get("has_access") and data.get("reason") == "code_invalid":
            pass_test("Correctly rejected without code")
        else:
            fail_test(f"Expected has_access=false, reason=code_invalid, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 8: Restore with wrong code
    test(8, "POST /api/payments/restore with wrong code")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-1", "access_code": "000000"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if not data.get("has_access") and data.get("reason") == "code_invalid":
            pass_test("Correctly rejected wrong code")
        else:
            fail_test(f"Expected has_access=false, reason=code_invalid, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 9: Restore with correct code (1st extra device)
    test(9, "POST /api/payments/restore with correct code (1st extra device)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-1", "access_code": "123456"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("has_access") and data.get("reason") == "granted":
            if data.get("slots_remaining") == 1:
                pass_test("1st extra device granted, 1 slot remaining")
            else:
                fail_test(f"Expected slots_remaining=1, got {data.get('slots_remaining')}")
        else:
            fail_test(f"Expected has_access=true, reason=granted, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 10: Restore with correct code (2nd extra device)
    test(10, "POST /api/payments/restore with correct code (2nd extra device)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-2", "access_code": "123456"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("has_access") and data.get("reason") == "granted":
            if data.get("slots_remaining") == 0:
                pass_test("2nd extra device granted, 0 slots remaining")
            else:
                fail_test(f"Expected slots_remaining=0, got {data.get('slots_remaining')}")
        else:
            fail_test(f"Expected has_access=true, reason=granted, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 11: Try 4th device (should fail - limit reached)
    test(11, "POST /api/payments/restore 4th device (should fail - limit reached)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-3", "access_code": "123456"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if not data.get("has_access") and data.get("reason") == "device_limit":
            if data.get("max_devices") == 3 and data.get("active_devices") == 3:
                pass_test("Correctly rejected 4th device")
            else:
                fail_test(f"Expected max_devices=3, active_devices=3, got {data}")
        else:
            fail_test(f"Expected has_access=false, reason=device_limit, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 12: Get my-info for purchaser device
    test(12, "GET /api/payments/my-info/dev-real-buyer")
    resp = requests.get(f"{BASE_URL}/api/payments/my-info/dev-real-buyer")
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        checks = []
        checks.append(("email", data.get("email") == "real@test.com"))
        checks.append(("access_code", data.get("access_code") == "123456"))
        checks.append(("max_devices", data.get("max_devices") == 3))
        checks.append(("active_devices", data.get("active_devices") == 3))
        checks.append(("slots_remaining", data.get("slots_remaining") == 0))
        checks.append(("extra_devices_count", len(data.get("extra_devices", [])) == 2))
        
        all_pass = all(check[1] for check in checks)
        if all_pass:
            pass_test("My-info correct for purchaser")
        else:
            fail_test(f"Field checks: {checks}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 13: Get my-info for non-purchaser (should 404)
    test(13, "GET /api/payments/my-info/dev-other-1 (should 404)")
    resp = requests.get(f"{BASE_URL}/api/payments/my-info/dev-other-1")
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 404:
        pass_test("Correctly returns 404 for non-purchaser")
    else:
        fail_test(f"Expected 404, got {resp.status_code}")

    # Test 14: Release device by purchaser
    test(14, "POST /api/payments/release-device (purchaser releases dev-other-1)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/release-device",
        json={"device_id": "dev-real-buyer", "target_device_id": "dev-other-1"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("released"):
            pass_test("Device released successfully")
        else:
            fail_test(f"Expected released=true, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 15: Try to release by non-purchaser (should fail)
    test(15, "POST /api/payments/release-device by non-purchaser (should fail)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/release-device",
        json={"device_id": "dev-not-buyer", "target_device_id": "dev-other-2"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 403:
        pass_test("Correctly rejected non-purchaser release")
    else:
        fail_test(f"Expected 403, got {resp.status_code}")

    # Test 16: Restore after release (should work now)
    test(16, "POST /api/payments/restore dev-other-3 after release (should work)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-other-3", "access_code": "123456"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("has_access"):
            pass_test("Device granted after slot freed")
        else:
            fail_test(f"Expected has_access=true, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 17: Admin devices endpoint
    test(17, "GET /api/admin/devices?email=real@test.com")
    resp = requests.get(
        f"{BASE_URL}/api/admin/devices",
        params={"key": ADMIN_KEY, "email": "real@test.com"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("count") >= 1:
            item = data["items"][0]
            checks = []
            checks.append(("tx_id", item.get("tx_id") == "tx-real"))
            checks.append(("access_code", item.get("access_code") == "123456"))
            checks.append(("max_devices", item.get("max_devices") == 3))
            checks.append(("purchaser_device", item.get("purchaser_device") == "dev-real-buyer"))
            checks.append(("active_count", item.get("active_count") >= 2))
            
            all_pass = all(check[1] for check in checks)
            if all_pass:
                pass_test("Admin devices endpoint correct")
            else:
                fail_test(f"Field checks: {checks}")
        else:
            fail_test("No devices found")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 18: Admin release device
    test(18, "POST /api/admin/release-device (release dev-other-2)")
    resp = requests.post(
        f"{BASE_URL}/api/admin/release-device",
        json={"tx_id": "tx-real", "device_id": "dev-other-2"},
        params={"key": ADMIN_KEY}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get("released") and not data.get("was_purchaser"):
            pass_test("Admin released extra device")
        else:
            fail_test(f"Expected released=true, was_purchaser=false, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 19: Admin regen code
    test(19, "POST /api/admin/regen-code for real@test.com")
    resp = requests.post(
        f"{BASE_URL}/api/admin/regen-code",
        json={"email": "real@test.com"},
        params={"key": ADMIN_KEY}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        new_code = data.get("access_code")
        if new_code and new_code != "123456" and len(new_code) == 6 and new_code.isdigit():
            test_data["new_code"] = new_code
            pass_test(f"Code regenerated: {new_code}")
        else:
            fail_test(f"Expected new 6-digit code, got {new_code}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    # Test 20: Try restore with old code (should fail)
    test(20, "POST /api/payments/restore with old code (should fail)")
    resp = requests.post(
        f"{BASE_URL}/api/payments/restore",
        json={"email": "real@test.com", "device_id": "dev-brand-new", "access_code": "123456"}
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code == 200:
        data = resp.json()
        if not data.get("has_access") and data.get("reason") == "code_invalid":
            pass_test("Old code correctly rejected")
        else:
            fail_test(f"Expected has_access=false, reason=code_invalid, got {data}")
    else:
        fail_test(f"Expected 200, got {resp.status_code}")

    print("\n" + "="*80)
    print("ALL TESTS COMPLETED")
    print("="*80)

except Exception as e:
    print(f"\n❌ EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
finally:
    cleanup()
