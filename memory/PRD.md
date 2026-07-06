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
- Flow: PENDIENTE credenciales del usuario (FLOW_API_KEY/FLOW_SECRET_KEY vacías en .env; FLOW_API_URL=https://www.flow.cl/api, cambiar a sandbox.flow.cl/api para pruebas). La UI oculta Flow hasta configurarlo.
- Paywall: selector de método (testID method-*), input email para Flow, precio $3.000 CLP.
- NOTA entorno: expo --tunnel requiere @expo/ngrok instalado globalmente (sudo npm i -g @expo/ngrok); se reinstaló tras reinicio del pod.

## Estado
- [x] Backend rutas + pagos implementado y verificado con curl (checkout crea sesión Stripe real de prueba)
- [x] Frontend completo (paywall, mapa, detalle, éxito de pago)
- [x] Testing e2e (iteración 1: 9/9 backend PASS, todos los flujos frontend PASS incl. pago real de prueba con tarjeta 4242 — Stripe mostró CLP 2.000 correcto)
- [x] Revisión de despliegue PASS (se agregó --tunnel a supervisor + @expo/ngrok global; se eliminaron endpoints boilerplate /api/status)
- [x] GPS en tiempo real: hook src/hooks/use-user-location.ts (expo-location watchPositionAsync), FAB "locate-button" en /map con flujo de permisos contextual (pre-explicación → request → denied/blocked → Abrir Ajustes), punto de usuario en ambos mapas (nativo anima cámara al primer fix; web dibuja punto si está dentro de la isla, aviso si está fuera). Permisos declarados en app.json (iOS infoPlist + Android).
- [x] Distancia desde la posición del usuario al inicio de cada ruta en las tarjetas de la lista ("Inicio a X km/m de ti", haversine, visible solo con GPS activo).

## Notas
- STRIPE_API_KEY agregada a /app/backend/.env ("sk_test_emergent").
- Tarjeta de prueba: 4242 4242 4242 4242.
- Diseño: /app/design_guidelines.json (Editorial Light, paleta terracota).
