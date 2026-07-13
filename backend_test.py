#!/usr/bin/env python3
"""
Backend test suite for Descubre Rapa Nui app.
Tests FastAPI serving Expo Web static files and API endpoints.
"""
import requests
import json
from pathlib import Path

BASE_URL = "http://localhost:8001"
FRONTEND_DIST = Path("/app/frontend/dist")

def test_result(test_name: str, passed: bool, details: str = ""):
    """Print test result in a clear format."""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {test_name}")
    if details:
        print(f"    {details}")
    return passed

def main():
    print("=" * 80)
    print("BACKEND TEST SUITE - Descubre Rapa Nui")
    print("Testing against:", BASE_URL)
    print("=" * 80)
    print()
    
    results = []
    
    # Test 1: GET / returns 200 with HTML containing "Descubre Rapa Nui"
    print("Test 1: GET / (root) should return Expo Web index.html")
    try:
        resp = requests.get(f"{BASE_URL}/", timeout=10)
        passed = (
            resp.status_code == 200 
            and "text/html" in resp.headers.get("content-type", "")
            and "<title>Descubre Rapa Nui</title>" in resp.text
        )
        details = f"Status: {resp.status_code}, Content-Type: {resp.headers.get('content-type')}, Has title: {'<title>Descubre Rapa Nui</title>' in resp.text}"
        results.append(test_result("GET /", passed, details))
    except Exception as e:
        results.append(test_result("GET /", False, f"Error: {e}"))
    print()
    
    # Test 2: GET /api/ returns 200 with JSON {"message":"Rutas Rapa Nui API"}
    print("Test 2: GET /api/ should return API root message")
    try:
        resp = requests.get(f"{BASE_URL}/api/", timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and data.get("message") == "Rutas Rapa Nui API"
        details = f"Status: {resp.status_code}, Response: {data}"
        results.append(test_result("GET /api/", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/", False, f"Error: {e}"))
    print()
    
    # Test 3: GET /api/routes returns 200 with array length > 0
    print("Test 3: GET /api/routes should return routes array")
    try:
        resp = requests.get(f"{BASE_URL}/api/routes", timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and isinstance(data, list) and len(data) > 0
        details = f"Status: {resp.status_code}, Array length: {len(data) if isinstance(data, list) else 'N/A'}"
        results.append(test_result("GET /api/routes", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/routes", False, f"Error: {e}"))
    print()
    
    # Test 4: GET /api/water-points returns 200 with array
    print("Test 4: GET /api/water-points should return water points array")
    try:
        resp = requests.get(f"{BASE_URL}/api/water-points", timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and isinstance(data, list)
        details = f"Status: {resp.status_code}, Array length: {len(data) if isinstance(data, list) else 'N/A'}"
        results.append(test_result("GET /api/water-points", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/water-points", False, f"Error: {e}"))
    print()
    
    # Test 5: GET /api/payments/providers returns correct structure
    print("Test 5: GET /api/payments/providers should return provider config")
    try:
        resp = requests.get(f"{BASE_URL}/api/payments/providers", timeout=10)
        data = resp.json()
        has_keys = all(k in data for k in ["stripe", "mercadopago", "flow", "price_clp"])
        price_correct = data.get("price_clp") == 3000
        passed = resp.status_code == 200 and has_keys and price_correct
        details = f"Status: {resp.status_code}, Has all keys: {has_keys}, price_clp: {data.get('price_clp')}"
        results.append(test_result("GET /api/payments/providers", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/payments/providers", False, f"Error: {e}"))
    print()
    
    # Test 6: GET /map (SPA fallback) returns 200 with HTML
    print("Test 6: GET /map (SPA route) should return index.html via fallback")
    try:
        resp = requests.get(f"{BASE_URL}/map", timeout=10)
        passed = (
            resp.status_code == 200 
            and "text/html" in resp.headers.get("content-type", "")
            and "<title>Descubre Rapa Nui</title>" in resp.text
        )
        details = f"Status: {resp.status_code}, Content-Type: {resp.headers.get('content-type')}"
        results.append(test_result("GET /map (SPA fallback)", passed, details))
    except Exception as e:
        results.append(test_result("GET /map (SPA fallback)", False, f"Error: {e}"))
    print()
    
    # Test 7: GET /route/rapa-nui-1 (SPA fallback) returns 200 with HTML
    print("Test 7: GET /route/rapa-nui-1 (SPA route) should return index.html via fallback")
    try:
        resp = requests.get(f"{BASE_URL}/route/rapa-nui-1", timeout=10)
        passed = (
            resp.status_code == 200 
            and "text/html" in resp.headers.get("content-type", "")
            and "<title>Descubre Rapa Nui</title>" in resp.text
        )
        details = f"Status: {resp.status_code}, Content-Type: {resp.headers.get('content-type')}"
        results.append(test_result("GET /route/rapa-nui-1 (SPA fallback)", passed, details))
    except Exception as e:
        results.append(test_result("GET /route/rapa-nui-1 (SPA fallback)", False, f"Error: {e}"))
    print()
    
    # Test 8: GET /api/no-existe returns 404
    print("Test 8: GET /api/no-existe should return 404")
    try:
        resp = requests.get(f"{BASE_URL}/api/no-existe", timeout=10)
        passed = resp.status_code == 404
        details = f"Status: {resp.status_code}"
        results.append(test_result("GET /api/no-existe (404)", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/no-existe (404)", False, f"Error: {e}"))
    print()
    
    # Test 9: GET /favicon.ico returns 200 with image content-type
    print("Test 9: GET /favicon.ico should return favicon")
    try:
        resp = requests.get(f"{BASE_URL}/favicon.ico", timeout=10)
        content_type = resp.headers.get("content-type", "")
        passed = resp.status_code == 200 and ("image" in content_type or "icon" in content_type)
        details = f"Status: {resp.status_code}, Content-Type: {content_type}"
        results.append(test_result("GET /favicon.ico", passed, details))
    except Exception as e:
        results.append(test_result("GET /favicon.ico", False, f"Error: {e}"))
    print()
    
    # Test 10: GET /_expo/static/js/web/entry-*.js returns 200 with size > 100KB
    print("Test 10: GET /_expo/static/js/web/entry-*.js should return JS bundle")
    try:
        # Find the actual entry file
        js_dir = FRONTEND_DIST / "_expo" / "static" / "js" / "web"
        entry_files = list(js_dir.glob("entry-*.js"))
        if entry_files:
            entry_file = entry_files[0].name
            resp = requests.get(f"{BASE_URL}/_expo/static/js/web/{entry_file}", timeout=10)
            size_kb = len(resp.content) / 1024
            passed = resp.status_code == 200 and size_kb > 100
            details = f"Status: {resp.status_code}, Size: {size_kb:.2f} KB, File: {entry_file}"
            results.append(test_result("GET /_expo/static/js/web/entry-*.js", passed, details))
        else:
            results.append(test_result("GET /_expo/static/js/web/entry-*.js", False, "No entry-*.js file found"))
    except Exception as e:
        results.append(test_result("GET /_expo/static/js/web/entry-*.js", False, f"Error: {e}"))
    print()
    
    # Test 11: Verify bundle JS contains "app-builder-9807.emergent.host"
    print("Test 11: Bundle JS should contain production URL 'app-builder-9807.emergent.host'")
    try:
        js_dir = FRONTEND_DIST / "_expo" / "static" / "js" / "web"
        entry_files = list(js_dir.glob("entry-*.js"))
        if entry_files:
            content = entry_files[0].read_text()
            passed = "app-builder-9807.emergent.host" in content
            details = f"Contains 'app-builder-9807.emergent.host': {passed}"
            results.append(test_result("Bundle contains production URL", passed, details))
        else:
            results.append(test_result("Bundle contains production URL", False, "No entry-*.js file found"))
    except Exception as e:
        results.append(test_result("Bundle contains production URL", False, f"Error: {e}"))
    print()
    
    # Test 12: Verify bundle JS contains WhatsApp share logic
    print("Test 12: Bundle JS should contain WhatsApp share logic")
    try:
        js_dir = FRONTEND_DIST / "_expo" / "static" / "js" / "web"
        entry_files = list(js_dir.glob("entry-*.js"))
        if entry_files:
            content = entry_files[0].read_text()
            has_whatsapp = "api.whatsapp.com/send?text=" in content
            has_title = "Descubre Rapa Nui" in content
            passed = has_whatsapp and has_title
            details = f"Has WhatsApp API: {has_whatsapp}, Has 'Descubre Rapa Nui': {has_title}"
            results.append(test_result("Bundle contains WhatsApp share logic", passed, details))
        else:
            results.append(test_result("Bundle contains WhatsApp share logic", False, "No entry-*.js file found"))
    except Exception as e:
        results.append(test_result("Bundle contains WhatsApp share logic", False, f"Error: {e}"))
    print()
    
    # Test 13: POST /api/payments/checkout with test data
    print("Test 13: POST /api/payments/checkout should handle checkout request")
    try:
        payload = {
            "device_id": "test-device-123",
            "origin_url": "http://localhost:8001",
            "provider": "mercadopago",
            "email": "test@example.com"
        }
        resp = requests.post(f"{BASE_URL}/api/payments/checkout", json=payload, timeout=10)
        # Accept 200 (success) or 502/503 (provider not configured) as valid responses
        passed = resp.status_code in [200, 502, 503]
        try:
            data = resp.json()
            details = f"Status: {resp.status_code}, Response: {data}"
        except:
            details = f"Status: {resp.status_code}"
        results.append(test_result("POST /api/payments/checkout", passed, details))
    except Exception as e:
        results.append(test_result("POST /api/payments/checkout", False, f"Error: {e}"))
    print()
    
    # Test 14: GET /api/payments/access/test-device-999 returns {"has_access": false}
    print("Test 14: GET /api/payments/access/test-device-999 should return no access")
    try:
        resp = requests.get(f"{BASE_URL}/api/payments/access/test-device-999", timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and data.get("has_access") == False
        details = f"Status: {resp.status_code}, Response: {data}"
        results.append(test_result("GET /api/payments/access/test-device-999", passed, details))
    except Exception as e:
        results.append(test_result("GET /api/payments/access/test-device-999", False, f"Error: {e}"))
    print()
    
    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed_count = sum(results)
    total_count = len(results)
    print(f"Passed: {passed_count}/{total_count}")
    print(f"Failed: {total_count - passed_count}/{total_count}")
    
    if passed_count == total_count:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("\n⚠️  SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
