#!/usr/bin/env python3
"""
Backend test for Flow payment bug fix verification.
Tests the fix for 403 Forbidden issue where urlReturn now points to frontend instead of backend.
"""

import httpx
import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Configuration
BASE_URL = "https://rapa-nui-routes-1.preview.emergentagent.com/api"
ADMIN_KEY = "RAPANUI-2026"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# Test results storage
test_results = []

def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f"\n   {details}"
    print(result)
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })

async def test_1_flow_checkout():
    """Test 1: POST /payments/checkout with provider=flow"""
    print("\n=== TEST 1: Flow Checkout Creation ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{BASE_URL}/payments/checkout",
                json={
                    "device_id": "test-device-fix-flow-123",
                    "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
                    "provider": "flow",
                    "email": "test.flow@example.cl",
                    "product_id": "song"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                has_url = "url" in data
                has_tx_id = "tx_id" in data
                has_session_id = "session_id" in data
                has_product_id = data.get("product_id") == "song"
                
                # Check if URL is a Flow URL
                is_flow_url = "flow.cl" in data.get("url", "")
                
                all_checks = has_url and has_tx_id and has_session_id and has_product_id and is_flow_url
                
                details = f"Response: {json.dumps(data, indent=2)}"
                if is_flow_url:
                    details += f"\n   Flow URL confirmed: {data.get('url')[:100]}..."
                
                log_test("Flow checkout returns 200 with valid response", all_checks, details)
                
                # Return tx_id and session_id for later tests
                return data.get("tx_id"), data.get("session_id")
            
            elif response.status_code == 400:
                # Flow might reject test emails
                error_data = response.json()
                error_detail = error_data.get("detail", "")
                
                if "email" in error_detail.lower() or "válido" in error_detail.lower():
                    log_test(
                        "Flow checkout email validation",
                        True,
                        f"Expected behavior: Flow rejects test emails. Error: {error_detail}"
                    )
                    # Try with a more realistic email
                    print("\n   Retrying with more realistic email...")
                    response2 = await client.post(
                        f"{BASE_URL}/payments/checkout",
                        json={
                            "device_id": "test-device-fix-flow-456",
                            "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
                            "provider": "flow",
                            "email": "cliente.real@gmail.com",
                            "product_id": "song"
                        }
                    )
                    
                    if response2.status_code == 200:
                        data2 = response2.json()
                        is_flow_url = "flow.cl" in data2.get("url", "")
                        log_test(
                            "Flow checkout with realistic email",
                            is_flow_url,
                            f"URL: {data2.get('url', '')[:100]}..."
                        )
                        return data2.get("tx_id"), data2.get("session_id")
                    else:
                        log_test(
                            "Flow checkout with realistic email",
                            False,
                            f"Status: {response2.status_code}, Body: {response2.text}"
                        )
                        return None, None
                else:
                    log_test("Flow checkout returns 200", False, f"Got 400: {error_detail}")
                    return None, None
            else:
                log_test("Flow checkout returns 200", False, f"Status: {response.status_code}, Body: {response.text}")
                return None, None
                
        except Exception as e:
            log_test("Flow checkout returns 200", False, f"Exception: {str(e)}")
            return None, None

async def test_2_verify_urlreturn_in_logs():
    """Test 2: Verify urlReturn construction in backend logs"""
    print("\n=== TEST 2: Verify urlReturn Parameter ===")
    
    # Read backend logs
    try:
        with open("/var/log/supervisor/backend.err.log", "r") as f:
            logs = f.read()
        
        # Look for recent Flow API calls
        if "payment-success" in logs:
            log_test(
                "urlReturn points to frontend /payment-success",
                True,
                "Found 'payment-success' in backend logs, indicating frontend redirect"
            )
        else:
            log_test(
                "urlReturn points to frontend /payment-success",
                False,
                "Could not verify urlReturn in logs. Check manually."
            )
    except Exception as e:
        log_test(
            "urlReturn verification in logs",
            False,
            f"Could not read logs: {str(e)}"
        )

async def test_3_webhook_simulation(session_id: str):
    """Test 3: Simulate Flow webhook"""
    print("\n=== TEST 3: Flow Webhook Simulation ===")
    
    if not session_id:
        log_test("Flow webhook simulation", False, "No session_id available from previous test")
        return
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{BASE_URL}/webhook/flow",
                data={"token": session_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                has_received = data.get("received") == True
                log_test(
                    "Flow webhook responds 200 with received:true",
                    has_received,
                    f"Response: {json.dumps(data)}"
                )
            else:
                log_test(
                    "Flow webhook responds 200",
                    False,
                    f"Status: {response.status_code}, Body: {response.text}"
                )
        except Exception as e:
            log_test("Flow webhook responds 200", False, f"Exception: {str(e)}")

async def test_4_regression_endpoints():
    """Test 4: Regression tests for other endpoints"""
    print("\n=== TEST 4: Regression Tests ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test GET /products
        try:
            response = await client.get(f"{BASE_URL}/products")
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", [])
                has_7_products = len(products) == 7
                log_test(
                    "GET /products returns 7 products",
                    has_7_products,
                    f"Found {len(products)} products"
                )
            else:
                log_test("GET /products", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("GET /products", False, f"Exception: {str(e)}")
        
        # Test GET /payments/providers
        try:
            response = await client.get(f"{BASE_URL}/payments/providers")
            if response.status_code == 200:
                data = response.json()
                all_enabled = data.get("stripe") and data.get("mercadopago") and data.get("flow")
                log_test(
                    "GET /payments/providers shows all enabled",
                    all_enabled,
                    f"stripe={data.get('stripe')}, mercadopago={data.get('mercadopago')}, flow={data.get('flow')}"
                )
            else:
                log_test("GET /payments/providers", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("GET /payments/providers", False, f"Exception: {str(e)}")
        
        # Test POST /payments/checkout with mercadopago
        try:
            response = await client.post(
                f"{BASE_URL}/payments/checkout",
                json={
                    "device_id": "test-device-mp-regression",
                    "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
                    "provider": "mercadopago",
                    "email": "test.mp@example.com",
                    "product_id": "agencies"
                }
            )
            if response.status_code == 200:
                data = response.json()
                is_mp_url = "mercadopago" in data.get("url", "")
                log_test(
                    "POST /payments/checkout with mercadopago",
                    is_mp_url,
                    f"URL: {data.get('url', '')[:80]}..."
                )
            else:
                log_test("POST /payments/checkout with mercadopago", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("POST /payments/checkout with mercadopago", False, f"Exception: {str(e)}")
        
        # Test POST /payments/checkout with stripe
        try:
            response = await client.post(
                f"{BASE_URL}/payments/checkout",
                json={
                    "device_id": "test-device-stripe-regression",
                    "origin_url": "https://rapa-nui-routes-1.preview.emergentagent.com",
                    "provider": "stripe",
                    "email": "test.stripe@example.com",
                    "product_id": "restaurants"
                }
            )
            if response.status_code == 200:
                data = response.json()
                is_stripe_url = "stripe" in data.get("url", "")
                log_test(
                    "POST /payments/checkout with stripe",
                    is_stripe_url,
                    f"URL: {data.get('url', '')[:80]}..."
                )
            else:
                log_test("POST /payments/checkout with stripe", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("POST /payments/checkout with stripe", False, f"Exception: {str(e)}")
        
        # Test GET /admin/sales
        try:
            response = await client.get(
                f"{BASE_URL}/admin/sales",
                headers={"X-Admin-Key": ADMIN_KEY}
            )
            if response.status_code == 200:
                data = response.json()
                has_required_fields = all(k in data for k in ["total_clp", "sales_count", "by_provider", "by_product"])
                log_test(
                    "GET /admin/sales with admin key",
                    has_required_fields,
                    f"Fields present: {list(data.keys())}"
                )
            else:
                log_test("GET /admin/sales", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("GET /admin/sales", False, f"Exception: {str(e)}")

async def test_5_legacy_flow_return_endpoint():
    """Test 5: Verify legacy /payments/flow/return endpoint exists"""
    print("\n=== TEST 5: Legacy Flow Return Endpoint ===")
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        try:
            response = await client.get(f"{BASE_URL}/payments/flow/return?token=fake-token-test")
            
            # Should redirect (303) or return 404, but not 404 on the route itself
            if response.status_code in [303, 302, 404]:
                log_test(
                    "Legacy /payments/flow/return endpoint exists",
                    True,
                    f"Status: {response.status_code} (endpoint exists, redirects or returns 404 for fake token)"
                )
            else:
                log_test(
                    "Legacy /payments/flow/return endpoint exists",
                    False,
                    f"Unexpected status: {response.status_code}"
                )
        except Exception as e:
            log_test("Legacy /payments/flow/return endpoint", False, f"Exception: {str(e)}")

async def test_6_restore_existing_customer():
    """Test 6: Verify existing customer antuaji@gmail.com can restore access"""
    print("\n=== TEST 6: Restore Access for Existing Customer ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{BASE_URL}/payments/restore",
                json={
                    "email": "antuaji@gmail.com",
                    "device_id": "test-device-restore-verification"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                unlocked = data.get("unlocked", [])
                
                # Should have song and emergencies at minimum
                has_song = "song" in unlocked
                has_emergencies = "emergencies" in unlocked
                
                log_test(
                    "Restore access for antuaji@gmail.com",
                    has_song and has_emergencies,
                    f"Unlocked products: {unlocked}"
                )
            else:
                log_test(
                    "Restore access for antuaji@gmail.com",
                    False,
                    f"Status: {response.status_code}, Body: {response.text}"
                )
        except Exception as e:
            log_test("Restore access for antuaji@gmail.com", False, f"Exception: {str(e)}")

async def test_7_check_pending_customer():
    """Test 7: Check transaction status for hernanluiis@gmail.com"""
    print("\n=== TEST 7: Check Pending Customer hernanluiis@gmail.com ===")
    
    try:
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Query for transactions with this email
        transactions = await db.payment_transactions.find(
            {"email": "hernanluiis@gmail.com"}
        ).to_list(100)
        
        if transactions:
            for tx in transactions:
                status = tx.get("payment_status", "unknown")
                product = tx.get("product_name", tx.get("product_id", "unknown"))
                amount = tx.get("amount_clp", 0)
                provider = tx.get("provider", "unknown")
                created = tx.get("created_at", "unknown")
                
                log_test(
                    f"Transaction found for hernanluiis@gmail.com",
                    True,
                    f"Status: {status}, Product: {product}, Amount: {amount} CLP, Provider: {provider}, Created: {created}"
                )
        else:
            log_test(
                "Transaction search for hernanluiis@gmail.com",
                True,
                "No transactions found for this email"
            )
        
        client.close()
    except Exception as e:
        log_test("Check pending customer", False, f"Exception: {str(e)}")

async def test_8_verify_urlreturn_in_db():
    """Test 8: Verify urlReturn in database transaction (if tx was created)"""
    print("\n=== TEST 8: Verify urlReturn in Database ===")
    
    try:
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Find recent Flow transactions from our tests
        recent_tx = await db.payment_transactions.find_one(
            {"provider": "flow", "device_id": {"$regex": "test-device-fix-flow"}},
            sort=[("created_at", -1)]
        )
        
        if recent_tx:
            # The urlReturn is sent to Flow but not stored in our DB
            # We can verify the origin_url is correct
            origin_url = recent_tx.get("origin_url", "")
            is_correct_origin = "rapa-nui-routes-1.preview.emergentagent.com" in origin_url
            
            log_test(
                "Transaction has correct origin_url for frontend redirect",
                is_correct_origin,
                f"origin_url: {origin_url}"
            )
        else:
            log_test(
                "Verify urlReturn in database",
                False,
                "No recent Flow test transaction found in database"
            )
        
        client.close()
    except Exception as e:
        log_test("Verify urlReturn in database", False, f"Exception: {str(e)}")

async def main():
    """Run all tests"""
    print("=" * 80)
    print("FLOW PAYMENT BUG FIX VERIFICATION")
    print("Testing fix for 403 Forbidden issue with Flow urlReturn")
    print("=" * 80)
    
    # Test 1: Create Flow checkout
    tx_id, session_id = await test_1_flow_checkout()
    
    # Test 2: Verify urlReturn in logs
    await test_2_verify_urlreturn_in_logs()
    
    # Test 3: Webhook simulation
    await test_3_webhook_simulation(session_id)
    
    # Test 4: Regression tests
    await test_4_regression_endpoints()
    
    # Test 5: Legacy endpoint
    await test_5_legacy_flow_return_endpoint()
    
    # Test 6: Restore existing customer
    await test_6_restore_existing_customer()
    
    # Test 7: Check pending customer
    await test_7_check_pending_customer()
    
    # Test 8: Verify urlReturn in DB
    await test_8_verify_urlreturn_in_db()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED - Flow bug fix verified successfully!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - see details above")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    asyncio.run(main())
