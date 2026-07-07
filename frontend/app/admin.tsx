import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { storage } from "@/src/utils/storage";
import WaterPointsEditor from "@/src/components/WaterPointsEditor";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const ADMIN_KEY_STORAGE = "rapa-nui-admin-key";

interface Sales {
  total_clp: number;
  sales_count: number;
  pending_count: number;
  by_provider: Record<string, { count: number; total_clp: number }>;
  recent: { provider: string; amount_clp: number; paid_at: string | null; device_id: string }[];
}

const PROVIDER_LABEL: Record<string, string> = {
  mercadopago: "Mercado Pago",
  flow: "Flow",
  stripe: "Tarjeta int. (Stripe)",
};

const PROVIDER_ICON: Record<string, any> = {
  mercadopago: "smartphone",
  flow: "credit-card",
  stripe: "globe",
};

const clp = (n: number) => `$${n.toLocaleString("es-CL")} CLP`;

export default function AdminPanel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingStored, setCheckingStored] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<Sales | null>(null);
  const [tab, setTab] = useState<"ventas" | "vai">("ventas");

  const fetchSales = useCallback(async (adminKey: string): Promise<boolean> => {
    const res = await fetch(`${BASE}/api/admin/sales`, {
      headers: { "X-Admin-Key": adminKey },
    });
    if (res.status === 401) return false;
    if (!res.ok) throw new Error("network");
    setSales(await res.json());
    return true;
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem(ADMIN_KEY_STORAGE, "");
      if (stored) {
        try {
          const ok = await fetchSales(stored);
          if (ok) {
            setKey(stored);
            setAuthed(true);
          }
        } catch {
          // pedir clave de nuevo
        }
      }
      setCheckingStored(false);
    })();
  }, [fetchSales]);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const ok = await fetchSales(key.trim());
      if (ok) {
        await storage.setItem(ADMIN_KEY_STORAGE, key.trim());
        setAuthed(true);
      } else {
        setError("Clave incorrecta.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchSales(key);
    } catch {
      // mantener datos anteriores
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await storage.removeItem(ADMIN_KEY_STORAGE);
    setAuthed(false);
    setKey("");
    setSales(null);
  };

  if (checkingStored) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={[styles.center, { paddingHorizontal: spacing.xxl }]}>
        <View style={styles.lockIcon}>
          <Feather name="lock" size={26} color={colors.onBrand} />
        </View>
        <Text style={styles.loginTitle}>Panel de Ventas</Text>
        <Text style={styles.loginSub}>Acceso exclusivo del dueño de la app.</Text>
        <TextInput
          style={styles.keyInput}
          placeholder="Clave de administrador"
          placeholderTextColor={colors.onSurfaceTertiary}
          value={key}
          onChangeText={setKey}
          secureTextEntry
          autoCapitalize="none"
          testID="admin-key-input"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.loginBtn} onPress={handleLogin} disabled={loading} testID="admin-login">
          {loading ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.loginBtnText}>Entrar</Text>
          )}
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginTop: spacing.lg }}>
          <Text style={styles.backLink}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} testID="admin-back">
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Panel del Dueño</Text>
        <Pressable onPress={handleLogout} hitSlop={12} style={styles.headerBtn} testID="admin-logout">
          <Feather name="log-out" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "ventas" && styles.tabActive]}
          onPress={() => setTab("ventas")}
          testID="tab-ventas"
        >
          <Feather name="bar-chart-2" size={14} color={tab === "ventas" ? colors.onBrand : colors.onSurfaceSecondary} />
          <Text style={[styles.tabText, tab === "ventas" && styles.tabTextActive]}>Ventas</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "vai" && styles.tabActive]}
          onPress={() => setTab("vai")}
          testID="tab-vai"
        >
          <Feather name="droplet" size={14} color={tab === "vai" ? colors.onBrand : colors.onSurfaceSecondary} />
          <Text style={[styles.tabText, tab === "vai" && styles.tabTextActive]}>Puntos Vai</Text>
        </Pressable>
      </View>

      {tab === "vai" ? (
        <WaterPointsEditor adminKey={key} bottomInset={insets.bottom} />
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL RECAUDADO</Text>
          <Text style={styles.totalValue} testID="total-clp">
            {clp(sales?.total_clp ?? 0)}
          </Text>
          <View style={styles.totalMeta}>
            <Text style={styles.totalMetaText}>
              {sales?.sales_count ?? 0} guías vendidas · {sales?.pending_count ?? 0} pagos pendientes
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Ventas por medio de pago</Text>
        {Object.keys(sales?.by_provider ?? {}).length === 0 ? (
          <Text style={styles.empty}>Aún no hay ventas. ¡Pronto llegarán! 🗿</Text>
        ) : (
          Object.entries(sales!.by_provider).map(([prov, d]) => (
            <View key={prov} style={styles.provRow}>
              <View style={styles.provIcon}>
                <Feather name={PROVIDER_ICON[prov] || "dollar-sign"} size={16} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.provName}>{PROVIDER_LABEL[prov] || prov}</Text>
                <Text style={styles.provCount}>{d.count} venta{d.count === 1 ? "" : "s"}</Text>
              </View>
              <Text style={styles.provTotal}>{clp(d.total_clp)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Últimas ventas</Text>
        {(sales?.recent ?? []).length === 0 ? (
          <Text style={styles.empty}>Sin transacciones todavía.</Text>
        ) : (
          sales!.recent.map((r, i) => (
            <View key={i} style={styles.saleRow}>
              <Feather
                name={PROVIDER_ICON[r.provider] || "dollar-sign"}
                size={14}
                color={colors.onSurfaceTertiary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.saleAmount}>{clp(r.amount_clp)}</Text>
                <Text style={styles.saleMeta}>
                  {PROVIDER_LABEL[r.provider] || r.provider} · disp. {r.device_id}…
                </Text>
              </View>
              <Text style={styles.saleDate}>
                {r.paid_at ? new Date(r.paid_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—"}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  loginTitle: { fontFamily: serif, fontSize: 26, color: colors.onSurface },
  loginSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginBottom: spacing.md },
  keyInput: {
    alignSelf: "stretch",
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  error: { color: colors.error, fontSize: 13 },
  loginBtn: {
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: { color: colors.onBrand, fontSize: 15, fontWeight: "700" },
  backLink: { color: colors.onSurfaceTertiary, fontSize: 13, textDecorationLine: "underline" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  tabTextActive: { color: colors.onBrand },
  totalCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  totalLabel: { color: colors.warning, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  totalValue: { fontFamily: serif, fontSize: 38, color: colors.onSurfaceInverse },
  totalMeta: { marginTop: spacing.xs },
  totalMetaText: { color: "rgba(249,248,246,0.7)", fontSize: 13 },
  sectionTitle: {
    fontFamily: serif,
    fontSize: 19,
    color: colors.onSurface,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  empty: { color: colors.onSurfaceTertiary, fontSize: 13, marginBottom: spacing.xl },
  provRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  provIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  provName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  provCount: { fontSize: 12, color: colors.onSurfaceTertiary },
  provTotal: { fontSize: 14, fontWeight: "700", color: colors.success },
  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  saleAmount: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  saleMeta: { fontSize: 11, color: colors.onSurfaceTertiary },
  saleDate: { fontSize: 12, color: colors.onSurfaceTertiary },
});
