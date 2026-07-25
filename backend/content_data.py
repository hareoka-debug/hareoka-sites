# Catálogo de productos y contenidos editables de "Descubre Rapa Nui" (modelo multi-producto)

# ---------------- Imágenes de portada ----------------
IMG_ROUTES_3 = "https://images.unsplash.com/photo-1774343420644-3653b409d609?crop=entropy&cs=srgb&fm=jpg&q=85"
IMG_ROUTES_ALL = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Playa_Anakena_-_panoramio.jpg/960px-Playa_Anakena_-_panoramio.jpg"
IMG_AGENCIES = "https://images.unsplash.com/photo-1579665063783-77579f0a38a3?crop=entropy&cs=srgb&fm=jpg&q=85"
IMG_RESTAURANTS = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?crop=entropy&cs=srgb&fm=jpg&q=85"
IMG_RENTCARS = "https://images.unsplash.com/photo-1577739156682-d3a82b8dea28?crop=entropy&cs=srgb&fm=jpg&q=85"
IMG_SONG = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Wild_Horses_of_Easter_Island.jpg/960px-Wild_Horses_of_Easter_Island.jpg"
IMG_EMERGENCIES = "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?crop=entropy&cs=srgb&fm=jpg&q=85"
IMG_HERO = "https://images.unsplash.com/photo-1597240890437-6d9c2d4c16aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHxFYXN0ZXIlMjBJc2xhbmQlMjBNb2FpJTIwc3RhdHVlJTIwbGFuZHNjYXBlfGVufDB8fHx8MTc4MzI4MzEyNXww&ixlib=rb-4.1.0&q=85"

# ---------------- Catálogo de productos ----------------
PRODUCTS = [
    {
        "id": "routes-3",
        "name": "3 Rutas Urbanas",
        "name_en": "3 Urban Routes",
        "short": "Hanga Roa, Costanera, Ana Kai Tangata",
        "short_en": "Hanga Roa, Coastline, Ana Kai Tangata",
        "description": "Acceso a 3 rutas urbanas fáciles: Circuito Hanga Roa, Costanera Policarpo Toro y Sendero Ana Kai Tangata.",
        "description_en": "Access to 3 easy urban routes: Hanga Roa circuit, Policarpo Toro seafront and Ana Kai Tangata trail.",
        "amount_clp": 3000,
        "kind": "routes",
        "route_ids": ["circuito-hanga-roa", "costanera-policarpo-toro", "ana-kai-tangata"],
        "image": IMG_ROUTES_3,
        "icon": "map",
        "color": "#B35D4A",
    },
    {
        "id": "routes-all",
        "name": "Las 11 Rutas Completas",
        "name_en": "All 11 Complete Routes",
        "short": "Guía completa de senderos",
        "short_en": "Full trail guide",
        "description": "Acceso a las 11 rutas urbanas y rurales de la isla, con moáis, playas y puntos de agua Vai.",
        "description_en": "Access to all 11 urban and rural routes of the island, with moais, beaches and Vai water points.",
        "amount_clp": 5000,
        "kind": "routes",
        "route_ids": "*",
        "image": IMG_ROUTES_ALL,
        "icon": "compass",
        "color": "#8B3A2E",
        "featured": True,
    },
    {
        "id": "agencies",
        "name": "Agencias de Tour",
        "name_en": "Tour Agencies",
        "short": "Todas las agencias de la isla",
        "short_en": "All tour agencies of the island",
        "description": "Contacto directo con las agencias de tours registradas en Rapa Nui.",
        "description_en": "Direct contact with registered tour agencies in Rapa Nui.",
        "amount_clp": 3000,
        "kind": "info",
        "image": IMG_AGENCIES,
        "icon": "briefcase",
        "color": "#2E86AB",
    },
    {
        "id": "restaurants",
        "name": "Restaurantes",
        "name_en": "Restaurants",
        "short": "Dónde comer en Rapa Nui",
        "short_en": "Where to eat in Rapa Nui",
        "description": "Restaurantes locales y de la isla con dirección y contacto.",
        "description_en": "Local restaurants of the island with address and contact.",
        "amount_clp": 3000,
        "kind": "info",
        "image": IMG_RESTAURANTS,
        "icon": "coffee",
        "color": "#E63946",
    },
    {
        "id": "rentcars",
        "name": "Rent a Car",
        "name_en": "Rent a Car",
        "short": "Arriendos de vehículos",
        "short_en": "Vehicle rentals",
        "description": "Todos los rent-a-car de la isla para moverte a tu ritmo.",
        "description_en": "All rent-a-car agencies of the island to move at your own pace.",
        "amount_clp": 3000,
        "kind": "info",
        "image": IMG_RENTCARS,
        "icon": "truck",
        "color": "#F4A261",
    },
    {
        "id": "song",
        "name": "Escucha y descubre la emoción que expresa el pasado",
        "name_en": "Listen and discover the emotion the past expresses",
        "short": "Música ancestral rapanui · Exclusivo",
        "short_en": "Ancestral Rapanui music · Exclusive",
        "description": "Sumérgete en un canto tradicional rapanui que ha viajado por generaciones. Contenido exclusivo, disponible en Spotify.",
        "description_en": "Immerse yourself in a traditional Rapanui chant that has traveled through generations. Exclusive content, available on Spotify.",
        "amount_clp": 3000,
        "kind": "media",
        "image": IMG_SONG,
        "icon": "music",
        "color": "#1DB954",
    },
    {
        "id": "emergencies",
        "name": "Emergencias",
        "name_en": "Emergencies",
        "short": "Bomberos, Hospital, PDI, Carabineros, Armada",
        "short_en": "Fire dept., Hospital, PDI, Police, Navy",
        "description": "Contactos de emergencia en la isla. Acceso siempre gratuito.",
        "description_en": "Emergency contacts on the island. Always free access.",
        "amount_clp": 0,
        "kind": "info",
        "image": IMG_EMERGENCIES,
        "icon": "alert-triangle",
        "color": "#DC2626",
        "always_free": True,
    },
]

PRODUCTS_BY_ID = {p["id"]: p for p in PRODUCTS}


def get_product(product_id: str) -> dict | None:
    return PRODUCTS_BY_ID.get(product_id)


# ---------------- Seeds de contenido editable ----------------
SEED_AGENCIES = [
    {"name": "Mahinatur", "phone": "+56 9 4052 2156", "whatsapp": "+56 9 4052 2156",
     "website": "https://mahinatur.cl/", "address": "Atamu Tekena s/n, Centro"},
    {"name": "Maori Tour Rapa Nui", "phone": "+56 9 4259 4391", "whatsapp": "+56 9 4259 4391",
     "website": "https://maoritourrapanui.com/"},
    {"name": "Pukaao Tours", "phone": "+56 9 4232 4189", "whatsapp": "+56 9 4232 4189",
     "website": "https://pukaomoaitoursrapanui.cl/", "address": "Simon Paoa, Hanga Roa"},
    {"name": "Rangitaki Tour", "phone": "+56 9 5777 6127", "whatsapp": "+56 9 5777 6127",
     "website": "https://rangitaki.com/"},
    {"name": "Rapanui Tours", "phone": "+56 9 9070 0582", "whatsapp": "+56 9 9070 0582",
     "website": "https://www.instagram.com/rapanui_tours"},
]

SEED_RESTAURANTS = [
    {"name": "Napo\"ea", "phone": "+56 9 9710 8349", "whatsapp": "+56 9 9710 8349",
     "website": "https://www.instagram.com/napoeapizzeria/",
     "address": "Apina Nui, Hanga Roa", "cuisine": "Pizzería"},
    {"name": "Pea Restobar", "phone": "+56 9 6777 9824", "whatsapp": "+56 9 6777 9824",
     "website": "https://www.instagram.com/pearestaurant_rapanuioficial/",
     "address": "Policarpo Toro, Borde Costero", "cuisine": "Restobar"},
    {"name": "Vainativa Experience Dinners", "phone": "+56 9 9383 8167", "whatsapp": "+56 9 9383 8167",
     "website": "https://vainativa.com/", "cuisine": "Cena experiencial"},
]

SEED_RENTCARS = [
    {"name": "Henua Roa", "phone": "+56 9 5786 7782", "whatsapp": "+56 9 5786 7782",
     "website": "https://henuaroa.cl/arriendo-de-vehiculos-en-rapanui/"},
    {"name": "Maika Rent a Car", "phone": "+56 9 9352 1015", "whatsapp": "+56 9 9352 1015",
     "website": "https://maicka.cl/", "address": "Hanga Roa, Rapa Nui"},
]

SEED_EMERGENCIES = [
    {"name": "Armada de Chile (Capitanía Hanga Roa)", "phone": "137",
     "category": "Marina", "description": "Salvamento marítimo."},
    {"name": "Bomberos Rapa Nui", "phone": "132",
     "category": "Bomberos", "description": "Emergencia de incendios y rescate."},
    {"name": "Carabineros", "phone": "133",
     "category": "Policía", "description": "Fuerza policial uniformada."},
    {"name": "Hospital Hanga Roa", "phone": "+56 32 2100 215",
     "category": "Salud", "description": "Hospital principal de la isla."},
    {"name": "PDI Rapa Nui", "phone": "134",
     "category": "Policía", "description": "Policía de Investigaciones."},
    {"name": "SAMU (Ambulancia)", "phone": "131",
     "category": "Salud", "description": "Servicio de urgencia médica."},
]

# Canciones/podcasts en Spotify. El "name" es el título mostrado.
SEED_SONGS = [
    {
        "name": "Descubre Rapa Nui — Episodio Exclusivo",
        "artist": "Podcast Rapa Nui",
        "spotify_url": "https://open.spotify.com/episode/0kWE5WDp7AmXtVSFQDLOG1?si=ce314c83399642cb",
        "description": "Escucha y descubre la emoción que expresa el pasado. Episodio exclusivo disponible en Spotify.",
    },
]

# Retro-compat con el modelo anterior (una sola canción).
SEED_SONG = {
    "id": "main",
    "title": SEED_SONGS[0]["name"],
    "artist": SEED_SONGS[0]["artist"],
    "spotify_url": SEED_SONGS[0]["spotify_url"],
    "description": SEED_SONGS[0]["description"],
}
