# PRD — Rutas Rapa Nui

## Problema original
"Crea una aplicación de pago de $2.000 CLP que indique las rutas urbanas y rurales registradas y existentes en la Isla de Pascua Rapa Nui, con múltiples detalles y sugerencias de comprar agua vai nativa."

## Decisiones del usuario
- Pago único de **$3.000 CLP** (subido desde $2.000 el 2026-06) con Stripe (clave de prueba del entorno: sk_test_emergent). Usuario evalúa medios de pago chilenos (Mercado Pago/Flow/Webpay) y cobro al descargar vía tiendas (carrier billing).
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

## Pagos multi-proveedor (iteración 2 — TESTED 20/20 backend + e2e frontend PASS)
- POST /api/payments/checkout {device_id, origin_url, provider: stripe|mercadopago|flow, email?} → {url, tx_id, session_id}
- GET /api/payments/providers → disponibilidad + price_clp (3000)
- GET /api/payments/status/{tx_id} → acepta tx_id interno o session_id; branch por provider
- Webhooks: /api/webhook/stripe, /api/webhook/mercadopago, /api/webhook/flow; retorno Flow: /api/payments/flow/return (POST→303 redirect)
- Mercado Pago: Access Token de PRODUCCIÓN del usuario en backend/.env (MP_ACCESS_TOKEN, APP_USR-...). Preferencias verificadas OK. Los pagos caen en su cuenta MP.
- Flow: credenciales de PRODUCCIÓN del usuario configuradas (FLOW_API_KEY/FLOW_SECRET_KEY en backend/.env, FLOW_API_URL=https://www.flow.cl/api). Verificado: orden creada y página de pago Flow muestra "$3.000 CLP" con Webpay/bancos. Flow valida que el email exista (error claro si es inválido). Los pagos se DEPOSITAN en la cuenta bancaria del usuario (1-3 días hábiles).
- Paywall: selector de método (testID method-*), input email para Flow, precio $3.000 CLP.
- NOTA entorno: expo --tunnel requiere @expo/ngrok instalado globalmente (sudo npm i -g @expo/ngrok); se reinstaló tras reinicio del pod.

## Panel de ventas (admin)
- GET /api/admin/sales (header X-Admin-Key) → total_clp, sales_count, pending_count, by_provider, recent(30)
- ADMIN_KEY="RAPANUI-2026" en backend/.env (también en /app/memory/test_credentials.md)
- Frontend: /app/frontend/app/admin.tsx (login con clave guardada en storage, dashboard con pull-to-refresh, logout)
- Acceso: URL /admin (web) o long-press (800ms) en el chip "Rutas Rapa Nui" del mapa
- Verificado: 401 con clave mala, dashboard muestra $5.000 (2 ventas de prueba Stripe)

## Puntos Vai editables + rebrand VAINATIVA (iteración 5 — ALL PASS)
- Marca: "AGUA VAINATIVA · EL AGUA DE RAPA NUI" (una palabra) en banner, paywall y detalles.
- water_points ahora en MongoDB (seed 7 puntos si colección vacía, desde routes_data.WATER_POINTS): vai-1 Supermercado HE IVI (renombrado), vai-6 Panadería HARAO TIRE, vai-7 Locales de Rano Raraku (nuevos).
- CRUD admin: POST/PUT/DELETE /api/admin/water-points[/{id}] con X-Admin-Key. Puntos creados llevan custom:true.
- Editor UI: pestaña "Puntos Vai" en /admin (src/components/WaterPointsEditor.tsx) con chips de sector predefinidos (7 sectores de la isla) en vez de lat/lng manual.
- Detalle de ruta: muestra buy_point_ids + puntos custom a ≤5 km del path (src/lib/geo.ts compartido).

## Estado
- [x] Backend rutas + pagos implementado y verificado con curl (checkout crea sesión Stripe real de prueba)
- [x] Frontend completo (paywall, mapa, detalle, éxito de pago)
- [x] Testing e2e (iteración 1: 9/9 backend PASS, todos los flujos frontend PASS incl. pago real de prueba con tarjeta 4242 — Stripe mostró CLP 2.000 correcto)
- [x] Revisión de despliegue PASS (se agregó --tunnel a supervisor + @expo/ngrok global; se eliminaron endpoints boilerplate /api/status)
- [x] GPS en tiempo real: hook src/hooks/use-user-location.ts (expo-location watchPositionAsync), FAB "locate-button" en /map con flujo de permisos contextual (pre-explicación → request → denied/blocked → Abrir Ajustes), punto de usuario en ambos mapas (nativo anima cámara al primer fix; web dibuja punto si está dentro de la isla, aviso si está fuera). Permisos declarados en app.json (iOS infoPlist + Android).
- [x] Distancia desde la posición del usuario al inicio de cada ruta en las tarjetas de la lista ("Inicio a X km/m de ti", haversine, visible solo con GPS activo).
- [x] Banner publicitario "Agua Vai Nativa": componente src/components/VaiBanner.tsx con 5 mensajes rotativos (fade cada 6s). Aparece en el detalle de cada ruta (al visitar un sitio) y en el mapa cuando hay ruta seleccionada (con tap → detalle).
- [x] Mapa satelital estilo Google Earth: web usa imagen satelital real ESRI World Imagery (export EPSG:4326 que calza con la proyección lineal, SvgImage de fondo, halos blancos en rutas, labels blancos, preserveAspectRatio xMidYMin). Nativo usa mapType="hybrid" con cámara inclinada 3D (pitch 45°, initialCamera) y showsBuildings — verificar en Expo Go.
- [x] Fotos reales georreferenciadas en los 41 POIs: campo "photo" en routes_data.py con imágenes reales de Wikimedia Commons (verificadas 200 OK, thumbs 1280px). UI: miniatura en cada POI + coordenadas "XX.XXXX° S · XXX.XXXX° O" siempre visibles; tap expande foto grande con badge "Foto real · coordenadas".

## Notas
- STRIPE_API_KEY agregada a /app/backend/.env ("sk_test_emergent").
- Tarjeta de prueba: 4242 4242 4242 4242.
- Diseño: /app/design_guidelines.json (Editorial Light, paleta terracota).
