# PRD — Rutas Rapa Nui

## Problema original
"Crea una aplicación de pago de $2.000 CLP que indique las rutas urbanas y rurales registradas y existentes en la Isla de Pascua Rapa Nui, con múltiples detalles y sugerencias de comprar agua vai nativa."

## Decisiones del usuario
- Pago único de $2.000 CLP con Stripe (clave de prueba del entorno: sk_test_emergent).
- Sin cuentas de usuario: acceso por dispositivo (device_id).
- Detalles completos por ruta: distancia, dificultad, tiempo, POIs (moáis, playas, sitios arqueológicos), consejos.
- Mapa interactivo con rutas dibujadas y marcadores.
- "Agua vai nativa": interpretado como puntos de compra de agua + consejos de hidratación por ruta (usuario marcó "otra cosa" dos veces sin explicar).
- Idioma UI: Español.

## Arquitectura
- Backend FastAPI (/app/backend/server.py) + datos estáticos en /app/backend/routes_data.py (11 rutas: 3 urbanas, 8 rurales; 5 puntos de agua "vai").
- Pagos: emergentintegrations StripeCheckout, moneda CLP. IMPORTANTE: la librería multiplica amount*100, por eso amount=20.0 → 2000 CLP.
- MongoDB: colección payment_transactions {session_id, device_id, amount_clp, payment_status}.
- Frontend Expo Router: 
  - app/index.tsx = Paywall (verifica acceso, checkout Stripe)
  - app/map.tsx = mapa + bottom sheet con lista de rutas y filtros
  - app/route/[id].tsx = detalle con sección "Puntos Vai & Hidratación"
  - app/payment-success.tsx = polling del pago
  - src/components/IslandMap.tsx (react-native-maps nativo) / IslandMap.web.tsx (SVG para web)
  - src/lib/api.ts, src/lib/theme.ts

## API
- GET /api/routes[?type=urbana|rural]
- GET /api/routes/{id}
- GET /api/water-points
- POST /api/payments/checkout {device_id, origin_url} → {url, session_id}
- GET /api/payments/status/{session_id}
- GET /api/payments/access/{device_id}
- POST /api/webhook/stripe

## Estado
- [x] Backend rutas + pagos implementado y verificado con curl (checkout crea sesión Stripe real de prueba)
- [x] Frontend completo (paywall, mapa, detalle, éxito de pago)
- [ ] Testing e2e (testing_agent)

## Notas
- STRIPE_API_KEY agregada a /app/backend/.env ("sk_test_emergent").
- Tarjeta de prueba: 4242 4242 4242 4242.
- Diseño: /app/design_guidelines.json (Editorial Light, paleta terracota).
