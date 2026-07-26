#!/usr/bin/env python3
"""
Backend test for /api/admin/manual-access GET endpoint bug fix.

This test verifies the fix for the bug where the owner saw "Total: 0" and no list
of granted accesses despite having granted access manually.

The fix ensures:
1. Only counts source-of-truth grants (device_id starting with "manual:")
2. Deduplicates products per email
3. Sorts by granted_at descending
4. Does not double-count when clients restore or when bind_device_id is used
"""

import httpx
import asyncio
import sys
from datetime import datetime

# Backend URL
BASE_URL = "https://direct-link-9.preview.emergentagent.com/api"
ADMIN_KEY = "RAPANUI-2026"

# Test results tracking
tests_passed = 0
tests_failed = 0
test_results = []


def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        status = "✅ PASS"
    else:
        tests_failed += 1
        status = "❌ FAIL"
    
    result = f"{status}: {name}"
    if details:
        result += f"\n    {details}"
    test_results.append(result)
    print(result)


async def test_auth_checks():
    """Test 1: Auth check - verify admin key is required"""
    print("\n=== TEST 1: Auth Checks ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1a: No header → expect 401
        resp = await client.get(f"{BASE_URL}/admin/manual-access")
        log_test(
            "Auth: No header → 401",
            resp.status_code == 401,
            f"Status: {resp.status_code}, Expected: 401"
        )
        
        # Test 1b: Wrong key → expect 401
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": "WRONG-KEY-123"}
        )
        log_test(
            "Auth: Wrong key → 401",
            resp.status_code == 401,
            f"Status: {resp.status_code}, Expected: 401"
        )
        
        # Test 1c: Correct key → expect 200
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        log_test(
            "Auth: Correct key → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )


async def test_baseline_state():
    """Test 2: Baseline / current state - verify existing grant"""
    print("\n=== TEST 2: Baseline / Current State ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test(
                "Baseline: GET request",
                False,
                f"Status: {resp.status_code}, Expected: 200"
            )
            return None
        
        data = resp.json()
        
        # Check response structure
        has_items = "items" in data
        has_total = "total" in data
        log_test(
            "Baseline: Response has {items, total}",
            has_items and has_total,
            f"Has items: {has_items}, Has total: {has_total}"
        )
        
        if not (has_items and has_total):
            return None
        
        items = data["items"]
        total = data["total"]
        
        # Check total >= 1
        log_test(
            "Baseline: total >= 1",
            total >= 1,
            f"Total: {total}, Expected: >= 1"
        )
        
        # Find antuaji@gmail.com
        antuaji_entry = None
        for item in items:
            if item.get("email") == "antuaji@gmail.com":
                antuaji_entry = item
                break
        
        log_test(
            "Baseline: antuaji@gmail.com appears in items",
            antuaji_entry is not None,
            f"Found: {antuaji_entry is not None}"
        )
        
        if antuaji_entry:
            products = antuaji_entry.get("products", [])
            # Check that "song" appears exactly once (not duplicated)
            song_count = products.count("song")
            log_test(
                "Baseline: antuaji@gmail.com has 'song' exactly once (dedup fix)",
                song_count == 1,
                f"Products: {products}, 'song' count: {song_count}, Expected: 1"
            )
            
            # Check required fields
            has_email = "email" in antuaji_entry
            has_products = "products" in antuaji_entry
            has_note = "note" in antuaji_entry
            has_granted_at = "granted_at" in antuaji_entry
            log_test(
                "Baseline: Item has required fields",
                has_email and has_products and has_note and has_granted_at,
                f"email: {has_email}, products: {has_products}, note: {has_note}, granted_at: {has_granted_at}"
            )
        
        print(f"\n📊 Current state: Total={total}, Items count={len(items)}")
        for item in items:
            print(f"  - {item.get('email')}: products={item.get('products')}, note='{item.get('note', '')}', granted_at={item.get('granted_at')}")
        
        return data


async def test_grant_list_verify():
    """Test 3: Grant → List → Verify counting"""
    print("\n=== TEST 3: Grant → List → Verify Counting ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get initial state
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        initial_total = resp.json()["total"] if resp.status_code == 200 else 0
        
        # Grant access
        grant_body = {
            "email": "test-list-bug@rapanui.cl",
            "product_ids": ["agencies", "restaurants"],
            "note": "test bug fix"
        }
        resp = await client.post(
            f"{BASE_URL}/admin/manual-access",
            json=grant_body,
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        log_test(
            "Grant: POST manual-access → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )
        
        if resp.status_code != 200:
            print(f"Grant failed: {resp.text}")
            return
        
        # Get updated list
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test("Grant: GET after grant", False, f"Status: {resp.status_code}")
            return
        
        data = resp.json()
        new_total = data["total"]
        items = data["items"]
        
        # Check total increased by 1
        log_test(
            "Grant: Total increased by 1",
            new_total == initial_total + 1,
            f"Initial: {initial_total}, New: {new_total}, Expected: {initial_total + 1}"
        )
        
        # Find the new email
        test_entry = None
        for item in items:
            if item.get("email") == "test-list-bug@rapanui.cl":
                test_entry = item
                break
        
        log_test(
            "Grant: New email appears in items",
            test_entry is not None,
            f"Found: {test_entry is not None}"
        )
        
        if test_entry:
            products = test_entry.get("products", [])
            # Check products contain both agencies and restaurants (no duplicates)
            has_agencies = "agencies" in products
            has_restaurants = "restaurants" in products
            no_duplicates = len(products) == len(set(products))
            
            log_test(
                "Grant: Products contain ['agencies', 'restaurants'] (no duplicates)",
                has_agencies and has_restaurants and no_duplicates,
                f"Products: {products}, Has agencies: {has_agencies}, Has restaurants: {has_restaurants}, No duplicates: {no_duplicates}"
            )
            
            # Check note
            note = test_entry.get("note", "")
            log_test(
                "Grant: Note is 'test bug fix'",
                note == "test bug fix",
                f"Note: '{note}', Expected: 'test bug fix'"
            )
            
            # Check granted_at is valid ISO date
            granted_at = test_entry.get("granted_at", "")
            try:
                datetime.fromisoformat(granted_at.replace("Z", "+00:00"))
                is_valid_date = True
            except:
                is_valid_date = False
            
            log_test(
                "Grant: granted_at is valid ISO date",
                is_valid_date,
                f"granted_at: {granted_at}, Valid: {is_valid_date}"
            )


async def test_grant_with_bind_device():
    """Test 4: Grant with bind_device_id → should NOT duplicate email in list"""
    print("\n=== TEST 4: Grant with bind_device_id → No Duplication ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Grant with bind_device_id
        grant_body = {
            "email": "test-bind@rapanui.cl",
            "product_ids": ["agencies"],
            "note": "with bind",
            "bind_device_id": "test-device-xyz"
        }
        resp = await client.post(
            f"{BASE_URL}/admin/manual-access",
            json=grant_body,
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        log_test(
            "Bind: POST with bind_device_id → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )
        
        if resp.status_code != 200:
            print(f"Grant with bind failed: {resp.text}")
            return
        
        # Get list
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test("Bind: GET after grant", False, f"Status: {resp.status_code}")
            return
        
        data = resp.json()
        items = data["items"]
        
        # Count how many times test-bind@rapanui.cl appears
        bind_entries = [item for item in items if item.get("email") == "test-bind@rapanui.cl"]
        
        log_test(
            "Bind: test-bind@rapanui.cl appears exactly once (not twice)",
            len(bind_entries) == 1,
            f"Count: {len(bind_entries)}, Expected: 1 (fix filters by device_id regex '^manual:')"
        )
        
        if bind_entries:
            products = bind_entries[0].get("products", [])
            agencies_count = products.count("agencies")
            log_test(
                "Bind: Products contain 'agencies' exactly once",
                agencies_count == 1,
                f"Products: {products}, 'agencies' count: {agencies_count}, Expected: 1"
            )


async def test_client_restore_no_double_count():
    """Test 5: Client restore does NOT double-count"""
    print("\n=== TEST 5: Client Restore Does NOT Double-Count ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Simulate customer restore
        restore_body = {
            "email": "test-list-bug@rapanui.cl",
            "device_id": "customer-device-abc"
        }
        resp = await client.post(
            f"{BASE_URL}/payments/restore",
            json=restore_body
        )
        
        log_test(
            "Restore: POST /payments/restore → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )
        
        if resp.status_code == 200:
            restore_data = resp.json()
            unlocked = restore_data.get("unlocked", [])
            has_agencies = "agencies" in unlocked
            has_restaurants = "restaurants" in unlocked
            has_emergencies = "emergencies" in unlocked
            
            log_test(
                "Restore: Unlocked contains agencies+restaurants+emergencies",
                has_agencies and has_restaurants and has_emergencies,
                f"Unlocked: {unlocked}"
            )
        
        # Get admin list
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test("Restore: GET after restore", False, f"Status: {resp.status_code}")
            return
        
        data = resp.json()
        items = data["items"]
        
        # Count how many times test-list-bug@rapanui.cl appears
        test_entries = [item for item in items if item.get("email") == "test-list-bug@rapanui.cl"]
        
        log_test(
            "Restore: test-list-bug@rapanui.cl STILL appears exactly once",
            len(test_entries) == 1,
            f"Count: {len(test_entries)}, Expected: 1 (restore creates secondary grant but list only counts manual:<email>)"
        )
        
        if test_entries:
            products = test_entries[0].get("products", [])
            # Check products are deduplicated
            has_agencies = "agencies" in products
            has_restaurants = "restaurants" in products
            no_duplicates = len(products) == len(set(products))
            
            log_test(
                "Restore: Products still show ['agencies', 'restaurants'] (deduplicated)",
                has_agencies and has_restaurants and no_duplicates,
                f"Products: {products}"
            )


async def test_revoke_list_updates():
    """Test 6: Revoke → List updates"""
    print("\n=== TEST 6: Revoke → List Updates ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get initial state
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        initial_total = resp.json()["total"] if resp.status_code == 200 else 0
        
        # Revoke test-list-bug@rapanui.cl
        revoke_body = {"email": "test-list-bug@rapanui.cl"}
        resp = await client.post(
            f"{BASE_URL}/admin/manual-access/revoke",
            json=revoke_body,
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        log_test(
            "Revoke: POST revoke → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )
        
        if resp.status_code == 200:
            revoke_data = resp.json()
            deleted_count = revoke_data.get("deleted", 0)
            log_test(
                "Revoke: Deleted count > 0",
                deleted_count > 0,
                f"Deleted: {deleted_count}"
            )
        
        # Get updated list
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test("Revoke: GET after revoke", False, f"Status: {resp.status_code}")
            return
        
        data = resp.json()
        new_total = data["total"]
        items = data["items"]
        
        # Check total decreased
        log_test(
            "Revoke: Total decreased",
            new_total < initial_total,
            f"Initial: {initial_total}, New: {new_total}"
        )
        
        # Check test-list-bug@rapanui.cl no longer appears
        test_entries = [item for item in items if item.get("email") == "test-list-bug@rapanui.cl"]
        log_test(
            "Revoke: test-list-bug@rapanui.cl no longer appears",
            len(test_entries) == 0,
            f"Count: {len(test_entries)}, Expected: 0"
        )


async def test_sort_order():
    """Test 7: Sort order - verify items sorted by granted_at descending"""
    print("\n=== TEST 7: Sort Order ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code != 200:
            log_test("Sort: GET request", False, f"Status: {resp.status_code}")
            return
        
        data = resp.json()
        items = data["items"]
        
        if len(items) < 2:
            log_test(
                "Sort: Items sorted by granted_at desc",
                True,
                f"Only {len(items)} item(s), cannot verify sort order"
            )
            return
        
        # Check if sorted descending
        is_sorted = True
        for i in range(len(items) - 1):
            current = items[i].get("granted_at", "")
            next_item = items[i + 1].get("granted_at", "")
            if current < next_item:
                is_sorted = False
                break
        
        log_test(
            "Sort: Items sorted by granted_at descending (most recent first)",
            is_sorted,
            f"First: {items[0].get('granted_at')}, Last: {items[-1].get('granted_at')}"
        )


async def test_cleanup():
    """Test 8: Cleanup - revoke test-bind@rapanui.cl"""
    print("\n=== TEST 8: Cleanup ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Revoke test-bind@rapanui.cl
        revoke_body = {"email": "test-bind@rapanui.cl"}
        resp = await client.post(
            f"{BASE_URL}/admin/manual-access/revoke",
            json=revoke_body,
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        log_test(
            "Cleanup: Revoke test-bind@rapanui.cl → 200",
            resp.status_code == 200,
            f"Status: {resp.status_code}, Expected: 200"
        )
        
        # Verify final state
        resp = await client.get(
            f"{BASE_URL}/admin/manual-access",
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        if resp.status_code == 200:
            data = resp.json()
            items = data["items"]
            
            # Check only antuaji@gmail.com remains
            emails = [item.get("email") for item in items]
            only_antuaji = all(email == "antuaji@gmail.com" for email in emails)
            
            log_test(
                "Cleanup: Only antuaji@gmail.com grant remains",
                only_antuaji or len(items) == 1,
                f"Emails: {emails}"
            )
            
            print(f"\n📊 Final state: Total={data['total']}, Items count={len(items)}")
            for item in items:
                print(f"  - {item.get('email')}: products={item.get('products')}")


async def main():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND TEST: /api/admin/manual-access GET endpoint bug fix")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print(f"Admin Key: {ADMIN_KEY}")
    print("=" * 80)
    
    try:
        # Run all tests in sequence
        await test_auth_checks()
        await test_baseline_state()
        await test_grant_list_verify()
        await test_grant_with_bind_device()
        await test_client_restore_no_double_count()
        await test_revoke_list_updates()
        await test_sort_order()
        await test_cleanup()
        
        # Print summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total tests: {tests_passed + tests_failed}")
        print(f"✅ Passed: {tests_passed}")
        print(f"❌ Failed: {tests_failed}")
        print("=" * 80)
        
        if tests_failed > 0:
            print("\n❌ SOME TESTS FAILED")
            print("\nFailed tests:")
            for result in test_results:
                if "❌ FAIL" in result:
                    print(result)
            sys.exit(1)
        else:
            print("\n✅ ALL TESTS PASSED")
            sys.exit(0)
    
    except Exception as e:
        print(f"\n❌ TEST EXECUTION ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
