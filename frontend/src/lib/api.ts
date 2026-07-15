import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

// En web usamos siempre el mismo origen que sirve la app (así funciona en
// preview y en el deploy definitivo sin depender de env). En nativo cae al
// EXPO_PUBLIC_BACKEND_URL configurado en frontend/.env.
const BASE: string =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_BACKEND_URL as string);

export interface Poi {
  name: string;
  type: string;
  lat: number;
  lng: number;
  description: string;
  photo?: string;
}

export interface VaiInfo {
  recommended_liters: string;
  buy_point_ids: string[];
  tips: string[];
}

export interface RouteData {
  id: string;
  name: string;
  type: "urbana" | "rural";
  distance_km: number;
  duration_min: number;
  difficulty: string;
  color: string;
  image: string;
  summary: string;
  description: string;
  path: [number, number][];
  pois: Poi[];
  vai: VaiInfo;
}

export interface WaterPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  description: string;
  custom?: boolean;
}

const DEVICE_ID_KEY = "rapa-nui-device-id";
const PENDING_SESSION_KEY = "rapa-nui-pending-session";
const PAID_KEY = "rapa-nui-paid";

export async function getDeviceId(): Promise<string> {
  const existing = await storage.getItem(DEVICE_ID_KEY, "");
  if (existing) return existing;
  const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export const getPendingSession = () => storage.getItem(PENDING_SESSION_KEY, "");
export const setPendingSession = (id: string) => storage.setItem(PENDING_SESSION_KEY, id);
export const clearPendingSession = () => storage.removeItem(PENDING_SESSION_KEY);
export const getLocalPaid = () => storage.getItem(PAID_KEY, false);
export const setLocalPaid = () => storage.setItem(PAID_KEY, true);

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export const fetchRoutes = () => get<RouteData[]>("/routes");
export const fetchRoute = (id: string) => get<RouteData>(`/routes/${id}`);
export const fetchWaterPoints = () => get<WaterPoint[]>("/water-points");

export interface AccessInfo {
  has_access: boolean;
  email?: string;
  is_purchaser?: boolean;
  needs_verification?: boolean;
  owned_packages?: string[];
  all_routes_unlocked?: boolean;
  raffle_participating?: boolean;
  raffle_code?: string;
  needs_package_selection?: boolean;
}

export async function checkAccess(deviceId: string): Promise<boolean> {
  const data = await get<AccessInfo>(`/payments/access/${deviceId}`);
  return data.has_access;
}

export async function checkAccessDetailed(deviceId: string): Promise<AccessInfo> {
  return get<AccessInfo>(`/payments/access/${deviceId}`);
}

export interface MyPurchaseInfo {
  email: string;
  session_ttl_hours: number;
  last_verified_at: string | null;
  owned_packages: string[];
  all_routes_unlocked: boolean;
  raffle_participating: boolean;
  raffle_code?: string | null;
}

export async function fetchMyPurchaseInfo(deviceId: string): Promise<MyPurchaseInfo | null> {
  const res = await fetch(`${BASE}/api/payments/my-info/${deviceId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export interface VerifyResult {
  verified: boolean;
  reason?: "purchaser" | "granted" | "no_payment" | "wrong_device";
  message?: string;
  session_ttl_hours?: number;
}

export async function verifyEmailOnly(deviceId: string, email: string): Promise<VerifyResult> {
  const res = await fetch(`${BASE}/api/payments/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json();
}

// ---------------- Paquetes ----------------
export interface PackageInfo {
  id: string;
  name: string;
  description: string;
  emoji: string;
  route_count: number;
  routes: { id: string; name: string; difficulty?: string; photo?: string }[];
}
export interface PackagesResponse {
  packages: PackageInfo[];
  prices: { base_clp: number; extra_package_clp: number; all_routes_clp: number };
}

export async function fetchPackages(): Promise<PackagesResponse> {
  return get<PackagesResponse>("/packages");
}

export async function selectPackage(
  deviceId: string,
  email: string,
  packageId: string,
): Promise<{ selected?: string; already_selected?: boolean; owned_packages: string[] }> {
  const res = await fetch(`${BASE}/api/payments/select-package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, email, package_id: packageId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json();
}

export async function createUpgradeCheckout(
  deviceId: string,
  email: string,
  kind: "package" | "all",
  originUrl: string,
  packageId?: string,
  provider: string = "mercadopago",
): Promise<{ url: string; tx_id: string }> {
  const res = await fetch(`${BASE}/api/payments/upgrade-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      email,
      kind,
      package_id: packageId || null,
      provider,
      origin_url: originUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json();
}

export interface Providers {
  stripe: boolean;
  mercadopago: boolean;
  flow: boolean;
  price_clp: number;
}

export const fetchProviders = () => get<Providers>("/payments/providers");

export async function createCheckout(
  deviceId: string,
  originUrl: string,
  provider: string,
  email?: string,
) {
  const res = await fetch(`${BASE}/api/payments/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      origin_url: originUrl,
      provider,
      email,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json() as Promise<{ url: string; tx_id: string }>;
}

export interface RestoreResult {
  has_access: boolean;
  reason?: "purchaser" | "already_granted" | "manual_grant" | "no_payment" | "code_invalid" | "wrong_device";
  session_ttl_hours?: number;
  message?: string;
}

export async function restoreByEmail(
  email: string,
  deviceId: string,
  accessCode?: string,
): Promise<RestoreResult> {
  const res = await fetch(`${BASE}/api/payments/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      device_id: deviceId,
      access_code: accessCode || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return (await res.json()) as RestoreResult;
}

export async function checkPaymentStatus(txId: string) {
  return get<{ status: string; payment_status: string }>(`/payments/status/${txId}`);
}

// --- Admin: Puntos Vai ---
export interface WaterPointInput {
  name: string;
  description: string;
  lat: number;
  lng: number;
  type?: string;
}

async function adminRequest(path: string, adminKey: string, method: string, body?: object) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json();
}

export const addWaterPoint = (adminKey: string, data: WaterPointInput) =>
  adminRequest("/admin/water-points", adminKey, "POST", data) as Promise<WaterPoint>;

export const updateWaterPoint = (adminKey: string, id: string, data: WaterPointInput) =>
  adminRequest(`/admin/water-points/${id}`, adminKey, "PUT", data) as Promise<WaterPoint>;

export const deleteWaterPoint = (adminKey: string, id: string) =>
  adminRequest(`/admin/water-points/${id}`, adminKey, "DELETE");
