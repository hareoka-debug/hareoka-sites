import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

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

export interface Product {
  id: string;
  name: string;
  name_en: string;
  short: string;
  short_en: string;
  description: string;
  description_en: string;
  amount_clp: number;
  kind: "routes" | "info" | "media";
  route_ids?: string[] | "*";
  image: string;
  icon: string;
  color: string;
  featured?: boolean;
  always_free?: boolean;
}

export interface ContentItem {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  description?: string;
  category?: string;
  cuisine?: string;
  artist?: string;
  spotify_url?: string;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  spotify_url: string;
  description?: string;
}

const DEVICE_ID_KEY = "rapa-nui-device-id";
const PENDING_SESSION_KEY = "rapa-nui-pending-session";
const UNLOCKED_KEY = "rapa-nui-unlocked";

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

export async function getLocalUnlocked(): Promise<string[]> {
  const raw = await storage.getItem(UNLOCKED_KEY, "");
  if (!raw) return ["emergencies"];
  try {
    const arr = JSON.parse(raw as string);
    if (Array.isArray(arr)) return Array.from(new Set([...arr, "emergencies"]));
  } catch {}
  return ["emergencies"];
}
export async function setLocalUnlocked(list: string[]): Promise<void> {
  const uniq = Array.from(new Set([...list, "emergencies"]));
  await storage.setItem(UNLOCKED_KEY, JSON.stringify(uniq));
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export const fetchRoutes = () => get<RouteData[]>("/routes");
export const fetchRoute = (id: string) => get<RouteData>(`/routes/${id}`);
export const fetchWaterPoints = () => get<WaterPoint[]>("/water-points");

export const fetchProducts = () => get<{ products: Product[] }>("/products").then((r) => r.products);
export const fetchProduct = (id: string) => get<Product>(`/products/${id}`);
export const fetchContent = (name: string) => get<{ items: ContentItem[] }>(`/content/${name}`).then((r) => r.items);
export const fetchSong = () => get<Song>("/content/song/current");
export const fetchSongs = () => get<{ items: ContentItem[] }>("/content/songs").then((r) => r.items);

export async function checkUnlocked(deviceId: string): Promise<string[]> {
  const data = await get<{ unlocked: string[] }>(`/payments/access/${deviceId}`);
  return data.unlocked;
}

export interface Providers {
  stripe: boolean;
  mercadopago: boolean;
  flow: boolean;
}

export const fetchProviders = () => get<Providers>("/payments/providers");

export async function createCheckout(
  deviceId: string,
  originUrl: string,
  provider: string,
  productId: string,
  email: string,
) {
  const res = await fetch(`${BASE}/api/payments/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      origin_url: originUrl,
      provider,
      product_id: productId,
      email,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json() as Promise<{ url: string; tx_id: string; product_id: string }>;
}

export async function restoreByEmail(email: string, deviceId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/payments/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, device_id: deviceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  const data = await res.json();
  return data.unlocked as string[];
}

export async function checkPaymentStatus(txId: string) {
  return get<{ status: string; payment_status: string; product_id?: string }>(`/payments/status/${txId}`);
}

// --- Compat aliases (legacy screens que aún usan la API monolítica) ---
export async function checkAccess(deviceId: string): Promise<boolean> {
  const list = await checkUnlocked(deviceId);
  return list.some((p) => p !== "emergencies");
}
export const getLocalPaid = async (): Promise<boolean> => {
  const list = await getLocalUnlocked();
  return list.some((p) => p !== "emergencies");
};
export const setLocalPaid = async (): Promise<void> => {
  const list = await getLocalUnlocked();
  await setLocalUnlocked(Array.from(new Set([...list, "routes-all"])));
};

// --- Admin ---
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

export interface AdminSales {
  total_clp: number;
  sales_count: number;
  pending_count: number;
  granted_count: number;
  by_provider: Record<string, { count: number; total_clp: number }>;
  by_product: Record<string, { count: number; total_clp: number; name: string }>;
  recent: {
    provider: string;
    amount_clp: number;
    paid_at: string | null;
    email: string;
    product_id: string | null;
    product_name?: string;
  }[];
}

export const adminFetchSales = (key: string) =>
  adminRequest("/admin/sales", key, "GET") as Promise<AdminSales>;

export const adminResetSales = (key: string) =>
  adminRequest("/admin/sales/reset", key, "POST", { confirm: "BORRAR" });

export const adminGrantManual = (key: string, email: string, productIds: string[], note: string) =>
  adminRequest("/admin/manual-access", key, "POST", { email, product_ids: productIds, note });

export const adminRevokeManual = (key: string, email: string) =>
  adminRequest("/admin/manual-access/revoke", key, "POST", { email });

export const adminListManual = (key: string) =>
  adminRequest("/admin/manual-access", key, "GET") as Promise<{
    items: { email: string; products: string[]; note: string; granted_at: string }[];
    total: number;
  }>;

export const adminListRoutes = (key: string) =>
  adminRequest("/admin/routes", key, "GET") as Promise<
    { id: string; name: string; type: string; distance_km: number; duration_min: number; difficulty: string; pois_count: number }[]
  >;

export const adminListContent = (key: string, name: string) =>
  adminRequest(`/admin/content/${name}`, key, "GET") as Promise<{ items: ContentItem[] }>;

export const adminCreateContent = (key: string, name: string, data: Partial<ContentItem>) =>
  adminRequest(`/admin/content/${name}`, key, "POST", data);

export const adminUpdateContent = (key: string, name: string, id: string, data: Partial<ContentItem>) =>
  adminRequest(`/admin/content/${name}/${id}`, key, "PUT", data);

export const adminDeleteContent = (key: string, name: string, id: string) =>
  adminRequest(`/admin/content/${name}/${id}`, key, "DELETE");

export const adminGetSong = (key: string) =>
  adminRequest("/admin/content/song/current", key, "GET") as Promise<Song>;

export const adminSaveSong = (key: string, data: Partial<Song>) =>
  adminRequest("/admin/content/song", key, "POST", data);

export const adminChangePassword = (key: string, current: string, newKey: string) =>
  adminRequest("/admin/change-password", key, "POST", { current, new_key: newKey });

// --- Registro/blindaje del dispositivo del dueño ---
export const adminRegisterDevice = (key: string, deviceId: string) =>
  adminRequest("/admin/register-device", key, "POST", { device_id: deviceId });

export const adminListOwnerDevices = (key: string) =>
  adminRequest("/admin/owner-devices", key, "GET") as Promise<{ device_ids: string[] }>;

// --- Autodestrucción tras intento no autorizado al admin ---
export async function selfDestructAccess(deviceId: string) {
  const res = await fetch(`${BASE}/api/access/self-destruct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Error ${res.status}`);
  }
  return res.json() as Promise<{
    destroyed: boolean;
    reason?: string;
    transactions_deleted: number;
    grants_deleted: number;
  }>;
}

// --- Puntos Vai (backwards compat) ---
export interface WaterPointInput {
  name: string;
  description: string;
  lat: number;
  lng: number;
  type?: string;
}

export const addWaterPoint = (adminKey: string, data: WaterPointInput) =>
  adminRequest("/admin/water-points", adminKey, "POST", data) as Promise<WaterPoint>;

export const updateWaterPoint = (adminKey: string, id: string, data: WaterPointInput) =>
  adminRequest(`/admin/water-points/${id}`, adminKey, "PUT", data) as Promise<WaterPoint>;

export const deleteWaterPoint = (adminKey: string, id: string) =>
  adminRequest(`/admin/water-points/${id}`, adminKey, "DELETE");
