# MIGRACIÓN A WEB — "Descubre Rapa Nui" (rapa-nui-routes)

> **INSTRUCCIONES PARA EL AGENTE DEL NUEVO JOB (Full Stack App / Web).**
> Este repo viene de un job del Mobile Agent de Emergent (Expo + FastAPI + MongoDB).
> El objetivo del dueño: **una URL web permanente donde los clientes usen la app
> directamente en el navegador**, sin Expo Go y sin tiendas de aplicaciones.

## 1. Lo más importante: la app YA funciona en web

El frontend es **Expo con soporte web completo** (`expo.web.output: "single"` en
`frontend/app.json`). Todas las pantallas (paywall, mapa, detalle de ruta, admin)
fueron probadas E2E en navegador durante 6 iteraciones del testing agent.

**NO reescribas el frontend en React/Next.js desde cero.** Opciones recomendadas
(en orden):

1. **Reusar el build web de Expo**: `cd frontend && npx expo export -p web`
   genera un sitio estático en `frontend/dist/` que puedes servir en el puerto 3000
   (por ejemplo con `serve` o montándolo detrás del frontend del template web).
   El mapa web usa `IslandMap.web.tsx` (imagen satelital + SVG, sin Google Maps).
2. Solo si el template web lo exige estrictamente, portar las pantallas a React
   (los componentes en `frontend/src/` son React casi puro; `StyleSheet` → CSS).

## 2. Arquitectura actual

- `frontend/` — Expo (expo-router). Rutas: `app/index.tsx` (paywall),
  `app/map.tsx` (mapa interactivo), `app/route/[id].tsx` (detalle),
  `app/admin.tsx` (panel ventas + editor de puntos de agua).
- `frontend/src/components/` — `IslandMap.tsx` / `IslandMap.web.tsx`,
  `VaiBanner.tsx`, `WaterPointsEditor.tsx`.
- `frontend/src/lib/` — `api.ts` (cliente API + device id + acceso local),
  `share.ts` (botón WhatsApp: en web comparte `window.location.origin`
  automáticamente → compartirá la URL definitiva sin cambios), `geo.ts`, `theme.ts`.
- `backend/server.py` — FastAPI: pagos, webhooks, admin, puntos de agua.
- `backend/routes_data.py` — dataset estático de 11 rutas y 41 POIs con fotos.
- El frontend llama al backend con `process.env.EXPO_PUBLIC_BACKEND_URL` + `/api`.

## 3. Endpoints del backend (prefijo `/api`)

- `GET /routes`, `GET /routes/{id}` — rutas y POIs.
- `GET /water-points` — puntos de venta de Agua VAINATIVA.
- `POST /payments/create` — body: `{device_id, email, provider}` con
  provider ∈ `stripe | mercadopago | flow`. Devuelve URL de checkout.
- `GET /payments/status/{session_id}` — polling post-pago.
- `POST /payments/check-access` — `{device_id}` → `{has_access}`.
- `POST /payments/restore` — `{email, device_id}` → restaura acceso pagado.
- `POST /webhooks/stripe | /webhooks/mercadopago | /webhooks/flow`.
- Admin (header `X-Admin-Key`): `GET /admin/sales`,
  `POST/PUT/DELETE /admin/water-points[/{id}]`.
- `GET /qr`, `GET /qr-definitivo` — sirven los PNG de `backend/static/`.

## 4. Variables de entorno requeridas (backend/.env — NO están en el repo)

Pedir los VALORES al usuario (los tiene en sus cuentas de cada proveedor):

```
MONGO_URL=...            # la da la plataforma
DB_NAME=...
CORS_ORIGINS="*"
STRIPE_API_KEY=          # clave de prueba del entorno Emergent (sk_test_emergent)
MP_ACCESS_TOKEN=         # Mercado Pago Chile — PRODUCCIÓN (APP_USR-...)
FLOW_API_KEY=            # Flow.cl — PRODUCCIÓN
FLOW_SECRET_KEY=         # Flow.cl — PRODUCCIÓN
FLOW_API_URL=https://www.flow.cl/api
ADMIN_KEY=               # clave del panel admin — preguntar al usuario
```

⚠️ **Mercado Pago y Flow usan credenciales REALES de producción**: no hacer
pagos de prueba con tarjetas reales sin autorización del usuario.

## 5. Base de datos (MongoDB)

- `transactions`: `{id, device_id, email, provider, session_id, status,
  amount_clp, paid_at}` — `status: "paid"` otorga acceso.
- `water_points`: `{id, name, description, lat, lng, type, custom, deleted}`.
  El backend siembra los puntos por defecto al arrancar; además hay un respaldo
  en `backend/seed_data/water_points.json` (incluye los puntos personalizados
  del usuario).
- **Clientes que ya pagaron**: la BD nueva arranca vacía. Preguntar al usuario
  qué emails de clientes ya pagados hay que insertar en `transactions`
  (con `status: "paid"`, `provider: "flow"`) para que puedan usar
  "Restaurar acceso con tu email".

## 6. Reglas de negocio clave

- Pago único de **$3.000 CLP por dispositivo**; acceso ligado a `device_id`
  con restauración por email.
- Banner promocional "Agua VAINATIVA" visible en mapa y detalle de ruta.
- Panel admin protegido con `ADMIN_KEY` (acceso: mantener presionado el título
  "Rutas Rapa Nui" del mapa ~1 segundo).
- Botón compartir por WhatsApp en mapa y detalle de ruta.

## 7. Checklist de despliegue del nuevo job

1. Levantar backend FastAPI (puerto 8001, rutas `/api/*`) con las env vars.
2. Servir el frontend web (export de Expo o port) en el puerto 3000.
3. Verificar flujo completo: paywall → pago → mapa → detalle → admin.
4. Deploy con el botón Publish → el usuario recibe su URL permanente
   `https://<app>.emergent.host`. El botón de WhatsApp compartirá esa URL
   automáticamente.
