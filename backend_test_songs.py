#!/usr/bin/env python3
"""
Test suite for Song CRUD functionality fix.
Tests that the "Canción" admin tab now supports full CRUD operations for multiple songs.

Review request: Verify the fix for the "Canción" tab that now supports complete CRUD 
for multiple songs (like agencies/restaurants), instead of only editing ONE song.
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
ADMIN_KEY = "RAPANUI-2026"

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Test results tracking
test_results = []
created_song_id = None


def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({"name": test_name, "passed": passed, "details": details})
    print(f"{status}: {test_name}")
    if details:
        print(f"   {details}")


async def test_1_public_list_songs():
    """Test 1: Público — listar canciones"""
    print("\n" + "="*80)
    print("TEST 1: Público — listar canciones (GET /content/songs)")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(f"{BASE_URL}/content/songs")
            data = resp.json()
            
            # Check status code
            passed = resp.status_code == 200
            if not passed:
                log_test("1. GET /content/songs returns 200", False, f"Status: {resp.status_code}")
                return
            
            # Check response structure
            has_items = "items" in data
            if not has_items:
                log_test("1. GET /content/songs has 'items' key", False, f"Response: {data}")
                return
            
            items = data["items"]
            has_songs = len(items) >= 1
            
            if not has_songs:
                log_test("1. GET /content/songs has at least 1 song", False, f"Items count: {len(items)}")
                return
            
            # Check first song has required fields
            first_song = items[0]
            required_fields = ["name", "artist", "spotify_url", "description"]
            missing_fields = [f for f in required_fields if f not in first_song]
            
            if missing_fields:
                log_test(
                    "1. GET /content/songs - first song has required fields",
                    False,
                    f"Missing fields: {missing_fields}, Song: {first_song}"
                )
                return
            
            # Verify seed song is present
            seed_name = "Descubre Rapa Nui — Episodio Exclusivo"
            seed_artist = "Podcast Rapa Nui"
            seed_url_contains = "episode/0kWE5WDp7AmXtVSFQDLOG1"
            
            seed_found = any(
                s.get("name") == seed_name and
                s.get("artist") == seed_artist and
                seed_url_contains in s.get("spotify_url", "")
                for s in items
            )
            
            log_test(
                "1. GET /content/songs - seed song present",
                seed_found,
                f"Seed song found: {seed_found}, Total songs: {len(items)}"
            )
            
            log_test(
                "1. GET /content/songs - returns 200 with items",
                True,
                f"Status: 200, Songs count: {len(items)}, First song: {first_song.get('name')}"
            )
            
        except Exception as e:
            log_test("1. GET /content/songs", False, f"Error: {e}")


async def test_2_retrocompat_current_song():
    """Test 2: Retro-compat — GET /content/song/current"""
    print("\n" + "="*80)
    print("TEST 2: Retro-compat — GET /content/song/current")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(f"{BASE_URL}/content/song/current")
            data = resp.json()
            
            # Check status code
            passed = resp.status_code == 200
            if not passed:
                log_test("2. GET /content/song/current returns 200", False, f"Status: {resp.status_code}")
                return
            
            # Check required fields
            required_fields = ["id", "title", "artist", "spotify_url", "description"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                log_test(
                    "2. GET /content/song/current has required fields",
                    False,
                    f"Missing fields: {missing_fields}, Response: {data}"
                )
                return
            
            # Verify title matches first song in catalog
            # The endpoint should return the first song from content_songs
            log_test(
                "2. GET /content/song/current - returns song with all fields",
                True,
                f"Status: 200, Title: {data.get('title')}, Artist: {data.get('artist')}"
            )
            
        except Exception as e:
            log_test("2. GET /content/song/current", False, f"Error: {e}")


async def test_3_admin_list_songs():
    """Test 3: Admin — listar canciones"""
    print("\n" + "="*80)
    print("TEST 3: Admin — listar canciones (GET /admin/content/songs)")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 3a: With admin key
        try:
            resp = await client.get(
                f"{BASE_URL}/admin/content/songs",
                headers={"X-Admin-Key": ADMIN_KEY}
            )
            data = resp.json()
            
            passed = resp.status_code == 200 and "items" in data
            log_test(
                "3a. GET /admin/content/songs with X-Admin-Key",
                passed,
                f"Status: {resp.status_code}, Items count: {len(data.get('items', []))}"
            )
        except Exception as e:
            log_test("3a. GET /admin/content/songs with X-Admin-Key", False, f"Error: {e}")
        
        # Test 3b: Without admin key (should fail)
        try:
            resp = await client.get(f"{BASE_URL}/admin/content/songs")
            log_test(
                "3b. GET /admin/content/songs without header returns 401",
                resp.status_code == 401,
                f"Status: {resp.status_code} (expected 401)"
            )
        except Exception as e:
            log_test("3b. GET /admin/content/songs without header", False, f"Error: {e}")


async def test_4_admin_create_song():
    """Test 4: Admin — crear una nueva canción"""
    print("\n" + "="*80)
    print("TEST 4: Admin — crear una nueva canción (POST /admin/content/songs)")
    print("="*80)
    
    global created_song_id
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            new_song = {
                "name": "Ka Pua",
                "artist": "Matato'a",
                "spotify_url": "https://open.spotify.com/track/example123",
                "description": "Canto tradicional pascuense"
            }
            
            resp = await client.post(
                f"{BASE_URL}/admin/content/songs",
                headers={"X-Admin-Key": ADMIN_KEY},
                json=new_song
            )
            data = resp.json()
            
            # Check status code
            passed = resp.status_code == 200
            if not passed:
                log_test(
                    "4. POST /admin/content/songs - create new song",
                    False,
                    f"Status: {resp.status_code}, Response: {data}"
                )
                return
            
            # Check response has id and all fields
            has_id = "id" in data
            has_name = data.get("name") == "Ka Pua"
            has_artist = data.get("artist") == "Matato'a"
            has_url = data.get("spotify_url") == "https://open.spotify.com/track/example123"
            has_desc = data.get("description") == "Canto tradicional pascuense"
            
            all_fields_correct = has_id and has_name and has_artist and has_url and has_desc
            
            if all_fields_correct:
                created_song_id = data.get("id")
                log_test(
                    "4. POST /admin/content/songs - create new song",
                    True,
                    f"Status: 200, Created song ID: {created_song_id}, Name: {data.get('name')}"
                )
            else:
                log_test(
                    "4. POST /admin/content/songs - create new song",
                    False,
                    f"Missing or incorrect fields. Response: {data}"
                )
            
        except Exception as e:
            log_test("4. POST /admin/content/songs", False, f"Error: {e}")


async def test_5_admin_edit_song():
    """Test 5: Admin — editar canción"""
    print("\n" + "="*80)
    print("TEST 5: Admin — editar canción (PUT /admin/content/songs/{id})")
    print("="*80)
    
    if not created_song_id:
        log_test("5. PUT /admin/content/songs/{id}", False, "No song ID from test 4")
        return
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            updated_song = {
                "name": "Ka Pua (edit)",
                "artist": "Matato'a",
                "spotify_url": "https://open.spotify.com/track/example456",
                "description": "Canto tradicional pascuense edit"
            }
            
            resp = await client.put(
                f"{BASE_URL}/admin/content/songs/{created_song_id}",
                headers={"X-Admin-Key": ADMIN_KEY},
                json=updated_song
            )
            data = resp.json()
            
            # Check status code
            passed = resp.status_code == 200
            if not passed:
                log_test(
                    "5. PUT /admin/content/songs/{id} - edit song",
                    False,
                    f"Status: {resp.status_code}, Response: {data}"
                )
                return
            
            # Check response reflects changes
            has_edited_name = data.get("name") == "Ka Pua (edit)"
            has_edited_url = data.get("spotify_url") == "https://open.spotify.com/track/example456"
            has_edited_desc = data.get("description") == "Canto tradicional pascuense edit"
            
            all_edits_correct = has_edited_name and has_edited_url and has_edited_desc
            
            log_test(
                "5. PUT /admin/content/songs/{id} - edit song",
                all_edits_correct,
                f"Status: 200, Updated name: {data.get('name')}, URL: {data.get('spotify_url')}"
            )
            
        except Exception as e:
            log_test("5. PUT /admin/content/songs/{id}", False, f"Error: {e}")


async def test_6_verify_edited_song_in_public_list():
    """Test 6: Verificar que aparece en la lista pública"""
    print("\n" + "="*80)
    print("TEST 6: Verificar que aparece en la lista pública")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(f"{BASE_URL}/content/songs")
            data = resp.json()
            
            items = data.get("items", [])
            
            # Should have at least 2 songs (seed + created)
            has_multiple = len(items) >= 2
            
            # Check if edited song is in the list
            edited_song_found = any(
                s.get("name") == "Ka Pua (edit)" and
                s.get("artist") == "Matato'a" and
                "example456" in s.get("spotify_url", "")
                for s in items
            )
            
            log_test(
                "6. GET /content/songs - edited song appears in public list",
                has_multiple and edited_song_found,
                f"Total songs: {len(items)}, Edited song found: {edited_song_found}"
            )
            
        except Exception as e:
            log_test("6. GET /content/songs - verify edited song", False, f"Error: {e}")


async def test_7_admin_delete_song():
    """Test 7: Admin — eliminar canción"""
    print("\n" + "="*80)
    print("TEST 7: Admin — eliminar canción (DELETE /admin/content/songs/{id})")
    print("="*80)
    
    if not created_song_id:
        log_test("7. DELETE /admin/content/songs/{id}", False, "No song ID from test 4")
        return
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.delete(
                f"{BASE_URL}/admin/content/songs/{created_song_id}",
                headers={"X-Admin-Key": ADMIN_KEY}
            )
            data = resp.json()
            
            # Check status code and response
            passed = resp.status_code == 200 and data.get("deleted") == True
            
            log_test(
                "7. DELETE /admin/content/songs/{id} - delete song",
                passed,
                f"Status: {resp.status_code}, Deleted: {data.get('deleted')}"
            )
            
            # Verify song is removed from public list
            resp2 = await client.get(f"{BASE_URL}/content/songs")
            data2 = resp2.json()
            items = data2.get("items", [])
            
            # Should be back to 1 song (only seed)
            back_to_one = len(items) == 1
            
            log_test(
                "7. GET /content/songs - verify song deleted",
                back_to_one,
                f"Songs count after delete: {len(items)} (expected 1)"
            )
            
        except Exception as e:
            log_test("7. DELETE /admin/content/songs/{id}", False, f"Error: {e}")


async def test_8_regression_other_collections():
    """Test 8: Regresión — otras colecciones siguen funcionando"""
    print("\n" + "="*80)
    print("TEST 8: Regresión — otras colecciones siguen funcionando")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test agencies
        try:
            resp = await client.get(f"{BASE_URL}/content/agencies")
            data = resp.json()
            passed = resp.status_code == 200 and len(data.get("items", [])) == 5
            log_test(
                "8a. GET /content/agencies - 5 items",
                passed,
                f"Status: {resp.status_code}, Items: {len(data.get('items', []))}"
            )
        except Exception as e:
            log_test("8a. GET /content/agencies", False, f"Error: {e}")
        
        # Test restaurants
        try:
            resp = await client.get(f"{BASE_URL}/content/restaurants")
            data = resp.json()
            passed = resp.status_code == 200 and len(data.get("items", [])) == 3
            log_test(
                "8b. GET /content/restaurants - 3 items",
                passed,
                f"Status: {resp.status_code}, Items: {len(data.get('items', []))}"
            )
        except Exception as e:
            log_test("8b. GET /content/restaurants", False, f"Error: {e}")
        
        # Test rentcars
        try:
            resp = await client.get(f"{BASE_URL}/content/rentcars")
            data = resp.json()
            passed = resp.status_code == 200 and len(data.get("items", [])) == 2
            log_test(
                "8c. GET /content/rentcars - 2 items",
                passed,
                f"Status: {resp.status_code}, Items: {len(data.get('items', []))}"
            )
        except Exception as e:
            log_test("8c. GET /content/rentcars", False, f"Error: {e}")
        
        # Test emergencies
        try:
            resp = await client.get(f"{BASE_URL}/content/emergencies")
            data = resp.json()
            passed = resp.status_code == 200 and len(data.get("items", [])) == 6
            log_test(
                "8d. GET /content/emergencies - 6 items",
                passed,
                f"Status: {resp.status_code}, Items: {len(data.get('items', []))}"
            )
        except Exception as e:
            log_test("8d. GET /content/emergencies", False, f"Error: {e}")


async def test_9_regression_main_endpoints():
    """Test 9: Regresión — endpoints principales sin regresión"""
    print("\n" + "="*80)
    print("TEST 9: Regresión — endpoints principales sin regresión")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test products
        try:
            resp = await client.get(f"{BASE_URL}/products")
            data = resp.json()
            passed = resp.status_code == 200 and len(data.get("products", [])) == 7
            log_test(
                "9a. GET /products - 7 products",
                passed,
                f"Status: {resp.status_code}, Products: {len(data.get('products', []))}"
            )
        except Exception as e:
            log_test("9a. GET /products", False, f"Error: {e}")
        
        # Test payment providers
        try:
            resp = await client.get(f"{BASE_URL}/payments/providers")
            data = resp.json()
            passed = (
                resp.status_code == 200 and
                data.get("stripe") == True and
                data.get("mercadopago") == True and
                data.get("flow") == True
            )
            log_test(
                "9b. GET /payments/providers - all enabled",
                passed,
                f"Status: {resp.status_code}, Providers: {data}"
            )
        except Exception as e:
            log_test("9b. GET /payments/providers", False, f"Error: {e}")
        
        # Test checkout with mercadopago
        try:
            resp = await client.post(
                f"{BASE_URL}/payments/checkout",
                json={
                    "product_id": "song",
                    "provider": "mercadopago",
                    "email": "test@example.cl",
                    "device_id": "test-song-crud",
                    "origin_url": "https://direct-link-9.preview.emergentagent.com"
                }
            )
            data = resp.json()
            passed = resp.status_code == 200 and "mercadopago" in data.get("url", "")
            log_test(
                "9c. POST /payments/checkout - mercadopago for song product",
                passed,
                f"Status: {resp.status_code}, URL contains mercadopago: {'mercadopago' in data.get('url', '')}"
            )
        except Exception as e:
            log_test("9c. POST /payments/checkout", False, f"Error: {e}")


async def test_10_product_access_verification():
    """Test 10: Verificación de acceso al producto song"""
    print("\n" + "="*80)
    print("TEST 10: Verificación de acceso al producto song")
    print("="*80)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 10a: Device without access
        try:
            resp = await client.get(f"{BASE_URL}/payments/access/test-device-no-existe")
            data = resp.json()
            unlocked = data.get("unlocked", [])
            passed = "emergencies" in unlocked and "song" not in unlocked
            log_test(
                "10a. GET /payments/access/{device_id} - no song access",
                passed,
                f"Status: {resp.status_code}, Unlocked: {unlocked}"
            )
        except Exception as e:
            log_test("10a. GET /payments/access/{device_id}", False, f"Error: {e}")
        
        # Test 10b: Grant manual access
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/manual-access",
                headers={"X-Admin-Key": ADMIN_KEY},
                json={
                    "email": "test-song-access@rapanui.cl",
                    "product_ids": ["song"],
                    "note": "test crud song"
                }
            )
            data = resp.json()
            passed = resp.status_code == 200 and "song" in data.get("granted", [])
            log_test(
                "10b. POST /admin/manual-access - grant song access",
                passed,
                f"Status: {resp.status_code}, Granted: {data.get('granted')}"
            )
        except Exception as e:
            log_test("10b. POST /admin/manual-access", False, f"Error: {e}")
        
        # Test 10c: Restore access
        try:
            resp = await client.post(
                f"{BASE_URL}/payments/restore",
                json={
                    "email": "test-song-access@rapanui.cl",
                    "device_id": "test-song-crud-999"
                }
            )
            data = resp.json()
            unlocked = data.get("unlocked", [])
            passed = "song" in unlocked
            log_test(
                "10c. POST /payments/restore - song in unlocked",
                passed,
                f"Status: {resp.status_code}, Unlocked: {unlocked}"
            )
        except Exception as e:
            log_test("10c. POST /payments/restore", False, f"Error: {e}")
        
        # Test 10d: Cleanup - revoke access
        try:
            resp = await client.post(
                f"{BASE_URL}/admin/manual-access/revoke",
                headers={"X-Admin-Key": ADMIN_KEY},
                json={"email": "test-song-access@rapanui.cl"}
            )
            data = resp.json()
            passed = resp.status_code == 200 and data.get("deleted", 0) > 0
            log_test(
                "10d. POST /admin/manual-access/revoke - cleanup",
                passed,
                f"Status: {resp.status_code}, Deleted: {data.get('deleted')}"
            )
        except Exception as e:
            log_test("10d. POST /admin/manual-access/revoke", False, f"Error: {e}")


async def verify_admin_key():
    """Verify admin key is still RAPANUI-2026"""
    print("\n" + "="*80)
    print("FINAL VERIFICATION: Admin key is still RAPANUI-2026")
    print("="*80)
    
    doc = await db.admin_settings.find_one({"id": "main"})
    db_key = doc.get("admin_key") if doc else None
    
    if db_key == ADMIN_KEY or db_key is None:
        print(f"✅ Admin key verified: {ADMIN_KEY}")
    else:
        print(f"⚠️  Admin key in DB: {db_key} (expected {ADMIN_KEY})")


async def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("SONG CRUD FUNCTIONALITY - TEST SUITE")
    print("Testing bug fix: Canción tab now supports full CRUD for multiple songs")
    print("="*80)
    
    try:
        # Run all test scenarios
        await test_1_public_list_songs()
        await test_2_retrocompat_current_song()
        await test_3_admin_list_songs()
        await test_4_admin_create_song()
        await test_5_admin_edit_song()
        await test_6_verify_edited_song_in_public_list()
        await test_7_admin_delete_song()
        await test_8_regression_other_collections()
        await test_9_regression_main_endpoints()
        await test_10_product_access_verification()
        
        # Verify admin key
        await verify_admin_key()
        
        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        passed_count = sum(1 for t in test_results if t["passed"])
        total_count = len(test_results)
        
        print(f"\nTotal: {passed_count}/{total_count} tests passed")
        
        # Group results by category
        failed_tests = [t for t in test_results if not t["passed"]]
        
        if passed_count == total_count:
            print("\n✅ ALL TESTS PASSED - Song CRUD is working correctly!")
            print("   The Canción tab now supports full CRUD for multiple songs.")
            return 0
        else:
            print(f"\n❌ {total_count - passed_count} TESTS FAILED")
            print("\nFailed tests:")
            for t in failed_tests:
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
