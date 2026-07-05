import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface Poi {
  name: string;
  type: string;
  lat: number;
  lng: number;
  description: string;
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

export async function checkAccess(deviceId: string): Promise<boolean> {
  const data = await get<{ has_access: boolean }>(`/payments/access/${deviceId}`);
  return data.has_access;
}

export async function createCheckout(deviceId: string, originUrl: string) {
  const res = await fetch(`${BASE}/api/payments/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, origin_url: originUrl }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<{ url: string; session_id: string }>;
}

export async function checkPaymentStatus(sessionId: string) {
  return get<{ status: string; payment_status: string }>(`/payments/status/${sessionId}`);
}
