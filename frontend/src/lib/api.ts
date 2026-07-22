import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

// En web usamos el mismo origen que sirve la app; en nativo cae al EXPO_PUBLIC_BACKEND_URL.
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

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json();
}

export const fetchRoutes = () => get<RouteData[]>("/routes");
export const fetchRoute = (id: string) => get<RouteData>(`/routes/${id}`);
export const fetchWaterPoints = () => get<WaterPoint[]>("/water-points");

// ---------------- Productos ----------------
export interface Product {
  id: string;
  name: string;
  name_en?: string;
  short: string;
  short_en?: string;
  description: string;
  description_en?: string;
  amount_clp: number;
  kind: "routes" | "info" | "media";
  route_ids?: string[] | "*";
  emoji: string;
  color: string;
}

export const fetchProducts = () => get<{ products: Product[] }>("/products");

// ---------------- Acceso ----------------
export interface AccessInfo {
  has_access: boolean;
  has_paid: boolean;
  needs_verification?: boolean;
  owned_products: string[];
  email?: string;
  session_ttl_hours?: number;
}

export const checkAccessDetailed = (deviceId: string) =>
  get<AccessInfo>(`/payments/access/${deviceId}`);

export interface VerifyResult {
  verified: boolean;
  reason?: string;
  message?: string;
  owned_products?: string[];
  session_ttl_hours?: number;
}

export const verifyEmailOnly = (deviceId: string, email: string) =>
  post<VerifyResult>("/payments/verify-email", { device_id: deviceId, email });

// ---------------- Providers ----------------
export interface Providers {
  stripe: boolean;
  mercadopago: boolean;
  flow: boolean;
}
export const fetchProviders = () => get<Providers>("/payments/providers");

// ---------------- Checkout ----------------
export const createCheckout = (
  deviceId: string,
  email: string,
  productId: string,
  provider: string,
  originUrl: string,
) =>
  post<{ url: string; tx_id: string }>("/payments/checkout", {
    device_id: deviceId,
    email,
    product_id: productId,
    provider,
    origin_url: originUrl,
  });

export const checkPaymentStatus = (txId: string) =>
  get<{ status: string; payment_status: string; product_id?: string }>(
    `/payments/status/${txId}`,
  );

export const claimTransaction = (txId: string, deviceId: string) =>
  post<{ claimed: boolean; reason?: string; email?: string; product_id?: string }>(
    `/payments/claim/${txId}`,
    { device_id: deviceId },
  );

// ---------------- Contenido ----------------
export interface ContentItem {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  description?: string;
  cuisine?: string;
  category?: string;
}

export const fetchContent = (collection: string) =>
  get<{ collection: string; items: ContentItem[] }>(`/content/${collection}`);

export interface SongConfig {
  title: string;
  artist: string;
  spotify_url: string;
  description: string;
}
export const fetchSong = () => get<SongConfig>("/content/song/current");

// ---------------- Admin ----------------
export async function adminRequest(
  path: string,
  adminKey: string,
  method: string,
  body?: object,
) {
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

export interface WaterPointInput {
  name: string;
  description: string;
  lat: number;
  lng: number;
  type?: string;
}
export const addWaterPoint = (k: string, d: WaterPointInput) =>
  adminRequest("/admin/water-points", k, "POST", d);
export const updateWaterPoint = (k: string, id: string, d: WaterPointInput) =>
  adminRequest(`/admin/water-points/${id}`, k, "PUT", d);
export const deleteWaterPoint = (k: string, id: string) =>
  adminRequest(`/admin/water-points/${id}`, k, "DELETE");
