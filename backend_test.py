#!/usr/bin/env python3
"""
Test suite for admin authentication master key recovery bug fix.
Tests that the DEFAULT_ADMIN_KEY (RAPANUI-2026) ALWAYS works as a master recovery key,
even after the user changes their password to a custom key.
"""

import httpx
import sys
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Configuration
BASE_URL = "https://direct-link-9.preview.emergentagent.com/api"
MASTER_KEY = "RAPANUI-2026"
CUSTOM_KEY = "MI-CLAVE-CUSTOM-999"
CUSTOM_KEY_2 = "otra-clave-999"

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Test results tracking
test_results = []


def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({"name": test_name, "passed": passed, "details": details})
    print(f"{status}: {test_name}")
    if details:
        print(f"   {details}")


async def reset_admin_key_to_default():
    """Reset admin_settings.admin_key to default RAPANUI-2026"""
    await db.admin_settings.update_one(
        {"id": "main"},
        {"$set": {"id": "main", "admin_key": MASTER_KEY}},
        upsert=True
    )
    print(f"🔧 Reset admin_key in DB to: {MASTER_KEY}")


async def get_current_admin_key_from_db():
    """Get current admin_key from database"""
    doc = await db.admin_settings.find_one({"id": "main"})
    if doc and doc.get("admin_key"):
        return doc["admin_key"]
    return None


async def test_1_initial_state_default_key():
    """Test 1: Estado inicial - solo clave por defecto en DB"""
    print("\n" + "="*80)
    print("TEST 1: Estado inicial - solo clave por defecto en DB")
    print("="*80)
    
    # Ensure DB has default key
    await reset_admin_key_to_default()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1a: Master key should work
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": MASTER_KEY}
            )
            log_test(
                "1a. GET /admin/sales with master key RAPANUI-2026",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
        except Exception as e:
            log_test("1a. GET /admin/sales with master key RAPANUI-2026", False, f"Error: {e}")
        
        # Test 1b: Wrong key should fail
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": "XXX"}
            )
            log_test(
                "1b. GET /admin/sales with wrong key 'XXX'",
                resp.status_code == 401,
                f"Status: {resp.status_code} (expected 401)"
            )
        except Exception as e:
            log_test("1b. GET /admin/sales with wrong key 'XXX'", False, f"Error: {e}")
        
        # Test 1c: No header should fail
        try:
            resp = await client.get(f"{BASE_URL}/admin/sales")
            log_test(
                "1c. GET /admin/sales without header",
                resp.status_code == 401,
                f"Status: {resp.status_code} (expected 401)"
            )
        except Exception as e:
            log_test("1c. GET /admin/sales without header", False, f"Error: {e}")


async def test_2_change_password_to_custom():
    """Test 2: Simular cambio de clave via Seguridad"""
    print("\n" + "="*80)
    print("TEST 2: Simular cambio de clave via Seguridad")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Change password from RAPANUI-2026 to MI-CLAVE-CUSTOM-999
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/change-password",
                headers={"X-Admin-Key": MASTER_KEY},
                json={"current": MASTER_KEY, "new_key": CUSTOM_KEY}
            )
            passed = resp.status_code == 200 and resp.json().get("changed") == True
            log_test(
                "2a. POST /admin/change-password (RAPANUI-2026 → MI-CLAVE-CUSTOM-999)",
                passed,
                f"Status: {resp.status_code}, Response: {resp.json()}"
            )
        except Exception as e:
            log_test("2a. POST /admin/change-password", False, f"Error: {e}")
        
        # Verify in DB
        db_key = await get_current_admin_key_from_db()
        log_test(
            "2b. Verify admin_key in DB is now MI-CLAVE-CUSTOM-999",
            db_key == CUSTOM_KEY,
            f"DB admin_key: {db_key}"
        )


async def test_3_master_key_recovery():
    """Test 3: CRÍTICO - verificar recuperación con clave maestra"""
    print("\n" + "="*80)
    print("TEST 3: CRÍTICO - verificar recuperación con clave maestra")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 3a: Custom key should work
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": CUSTOM_KEY}
            )
            log_test(
                "3a. GET /admin/sales with custom key MI-CLAVE-CUSTOM-999",
                resp.status_code == 200,
                f"Status: {resp.status_code} (custom key works)"
            )
        except Exception as e:
            log_test("3a. GET /admin/sales with custom key", False, f"Error: {e}")
        
        # Test 3b: CRITICAL - Master key should STILL work (recovery mechanism)
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": MASTER_KEY}
            )
            log_test(
                "3b. 🔑 GET /admin/sales with master key RAPANUI-2026 (RECOVERY TEST)",
                resp.status_code == 200,
                f"Status: {resp.status_code} (master key STILL works - THIS IS THE FIX!)"
            )
        except Exception as e:
            log_test("3b. GET /admin/sales with master key (RECOVERY)", False, f"Error: {e}")
        
        # Test 3c: Wrong key should fail
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": "xyz-wrong"}
            )
            log_test(
                "3c. GET /admin/sales with wrong key 'xyz-wrong'",
                resp.status_code == 401,
                f"Status: {resp.status_code} (expected 401)"
            )
        except Exception as e:
            log_test("3c. GET /admin/sales with wrong key", False, f"Error: {e}")


async def test_4_other_admin_routes_accept_both_keys():
    """Test 4: Otras rutas admin también aceptan ambas claves"""
    print("\n" + "="*80)
    print("TEST 4: Otras rutas admin también aceptan ambas claves")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 4a: Manual access with master key
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/manual-access",
                headers={"X-Admin-Key": MASTER_KEY},
                json={
                    "email": "test@rapa.cl",
                    "product_ids": ["song"],
                    "note": "test master key"
                }
            )
            data = resp.json()
            passed = (
                resp.status_code == 200 and
                data.get("granted") == ["song"] and
                data.get("email") == "test@rapa.cl"
            )
            log_test(
                "4a. POST /admin/manual-access with master key",
                passed,
                f"Status: {resp.status_code}, Response: {data}"
            )
        except Exception as e:
            log_test("4a. POST /admin/manual-access with master key", False, f"Error: {e}")
        
        # Test 4b: Revoke access with custom key
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/manual-access/revoke",
                headers={"X-Admin-Key": CUSTOM_KEY},
                json={"email": "test@rapa.cl"}
            )
            data = resp.json()
            passed = resp.status_code == 200 and data.get("deleted", 0) > 0
            log_test(
                "4b. POST /admin/manual-access/revoke with custom key",
                passed,
                f"Status: {resp.status_code}, Deleted: {data.get('deleted')}"
            )
        except Exception as e:
            log_test("4b. POST /admin/manual-access/revoke with custom key", False, f"Error: {e}")
        
        # Test 4c: GET /admin/routes with master key
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/routes",
                headers={"X-Admin-Key": MASTER_KEY}
            )
            data = resp.json()
            passed = resp.status_code == 200 and isinstance(data, list) and len(data) == 11
            log_test(
                "4c. GET /admin/routes with master key",
                passed,
                f"Status: {resp.status_code}, Routes count: {len(data) if isinstance(data, list) else 'N/A'}"
            )
        except Exception as e:
            log_test("4c. GET /admin/routes with master key", False, f"Error: {e}")


async def test_5_password_change_validation():
    """Test 5: Regresión - cambio de clave sigue exigiendo clave actual correcta"""
    print("\n" + "="*80)
    print("TEST 5: Regresión - cambio de clave sigue exigiendo clave actual correcta")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 5a: Change password with correct current key
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/change-password",
                headers={"X-Admin-Key": MASTER_KEY},
                json={"current": CUSTOM_KEY, "new_key": CUSTOM_KEY_2}
            )
            passed = resp.status_code == 200 and resp.json().get("changed") == True
            log_test(
                "5a. POST /admin/change-password with correct current key",
                passed,
                f"Status: {resp.status_code}, Changed: {resp.json().get('changed')}"
            )
        except Exception as e:
            log_test("5a. POST /admin/change-password with correct current", False, f"Error: {e}")
        
        # Test 5b: Try to change password with wrong current key
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/change-password",
                headers={"X-Admin-Key": MASTER_KEY},
                json={"current": "clave-incorrecta", "new_key": "yyy"}
            )
            log_test(
                "5b. POST /admin/change-password with wrong current key",
                resp.status_code == 401,
                f"Status: {resp.status_code} (expected 401)"
            )
        except Exception as e:
            log_test("5b. POST /admin/change-password with wrong current", False, f"Error: {e}")


async def test_6_restore_default_state():
    """Test 6: Restaurar estado - volver a clave por defecto"""
    print("\n" + "="*80)
    print("TEST 6: Restaurar estado - volver a clave por defecto")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Restore to default key
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/change-password",
                headers={"X-Admin-Key": MASTER_KEY},
                json={"current": CUSTOM_KEY_2, "new_key": MASTER_KEY}
            )
            passed = resp.status_code == 200 and resp.json().get("changed") == True
            log_test(
                "6a. POST /admin/change-password (restore to RAPANUI-2026)",
                passed,
                f"Status: {resp.status_code}, Changed: {resp.json().get('changed')}"
            )
        except Exception as e:
            log_test("6a. POST /admin/change-password (restore)", False, f"Error: {e}")
        
        # Verify master key works
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": MASTER_KEY}
            )
            log_test(
                "6b. GET /admin/sales with master key (verify restore)",
                resp.status_code == 200,
                f"Status: {resp.status_code}"
            )
        except Exception as e:
            log_test("6b. GET /admin/sales (verify restore)", False, f"Error: {e}")
        
        # Verify DB state
        db_key = await get_current_admin_key_from_db()
        log_test(
            "6c. Verify admin_key in DB is back to RAPANUI-2026",
            db_key == MASTER_KEY,
            f"DB admin_key: {db_key}"
        )


async def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("ADMIN AUTHENTICATION MASTER KEY RECOVERY - TEST SUITE")
    print("Testing bug fix: Master key RAPANUI-2026 should ALWAYS work")
    print("="*80)
    
    try:
        # Run all test scenarios
        await test_1_initial_state_default_key()
        await test_2_change_password_to_custom()
        await test_3_master_key_recovery()
        await test_4_other_admin_routes_accept_both_keys()
        await test_5_password_change_validation()
        await test_6_restore_default_state()
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        passed_count = sum(1 for t in test_results if t["passed"])
        total_count = len(test_results)
        
        print(f"\nTotal: {passed_count}/{total_count} tests passed")
        
        if passed_count == total_count:
            print("\n✅ ALL TESTS PASSED - Master key recovery is working correctly!")
            print("   The master key RAPANUI-2026 ALWAYS works, even after password changes.")
            return 0
        else:
            print(f"\n❌ {total_count - passed_count} TESTS FAILED")
            print("\nFailed tests:")
            for t in test_results:
                if not t["passed"]:
                    print(f"  - {t['name']}")
                    if t["details"]:
                        print(f"    {t['details']}")
            return 1
    
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
