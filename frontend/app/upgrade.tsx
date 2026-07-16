import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { storage } from "@/src/utils/storage";
import {
  PackageInfo,
  checkAccessDetailed,
  createUpgradeCheckout,
  fetchPackages,
  getDeviceId,
  setPendingSession,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

export default function Upgrade() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [allUnlocked, setAllUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pkgRes, deviceId] = await Promise.all([fetchPackages(), getDeviceId()]);
        setPackages(pkgRes.packages);
        const access = await checkAccessDetailed(deviceId);
        setOwned(access.owned_packages || []);
        setAllUnlocked(!!access.all_routes_unlocked);
      } catch (e: any) {
        setError(e?.message || "No pudimos cargar los paquetes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const doUpgrade = async (kind: "package" | "all", packageId?: string) => {
    setError(null);
    const key = kind === "all" ? "all" : packageId || "package";
    setBuying(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const deviceId = await getDeviceId();
      const email = (await storage.getItem("rapa-nui-email", "")) as string;
      if (!email) {
        setError("No encontramos tu email. Vuelve al inicio y verifica sesión.");
        return;
      }
      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : (process.env.EXPO_PUBLIC_BACKEND_URL as string);
      const { url, tx_id } = await createUpgradeCheckout(
        deviceId,
        email,
        kind,
        origin,
        packageId,
      );
      await setPendingSession(tx_id);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
        return;
      }
      // Nativo: se abre el navegador integrado
      const WebBrowser = await import("expo-web-browser");
      await WebBrowser.openBrowserAsync(url);
      router.replace("/map");
    } catch (e: any) {
      setError(e?.message || "No pudimos iniciar el pago. Intenta de nuevo.");
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Feather name="arrow-left" size={20} color={colors.onSurface} />
        <Text style={styles.backText}>Volver al mapa</Text>
      </Pressable>

      <Text style={styles.title}>Desbloquear más rutas</Text>
      <Text style={styles.sub}>
        Ya tienes {owned.length} de 3 paquete{owned.length === 1 ? "" : "s"} activo{owned.length === 1 ? "" : "s"}.
        {allUnlocked ? " Ya desbloqueaste todas las rutas 🎉" : ""}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!allUnlocked && (
        <>
          {/* Card all */}
          <View style={[styles.card, styles.cardAll]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>🌟 Todas las 11 rutas</Text>
              <View style={styles.priceBadge}>
                <Text style={styles.priceText}>+$5.000</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Desbloquea los 3 paquetes de una vez. Explora Rapa Nui completa.
            </Text>
            <Pressable
              style={[styles.buyBtn, buying === "all" && { opacity: 0.6 }]}
              onPress={() => doUpgrade("all")}
              disabled={!!buying}
              testID="buy-all"
            >
              {buying === "all" ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.buyText}>Comprar todas las rutas</Text>
              )}
            </Pressable>
          </View>

          {/* Cards por paquete */}
          {packages.filter((p) => !owned.includes(p.id)).map((pkg) => (
            <View key={pkg.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {pkg.emoji} {pkg.name}
                </Text>
                <View style={styles.priceBadgeSm}>
                  <Text style={styles.priceTextSm}>+$3.000</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>
                {pkg.description} ({pkg.route_count} rutas)
              </Text>
              <Pressable
                style={[styles.buyBtn2, buying === pkg.id && { opacity: 0.6 }]}
                onPress={() => doUpgrade("package", pkg.id)}
                disabled={!!buying}
                testID={`buy-pkg-${pkg.id}`}
              >
                {buying === pkg.id ? (
                  <ActivityIndicator color={colors.onSurface} />
                ) : (
                  <Text style={styles.buyText2}>Agregar este paquete</Text>
                )}
              </Pressable>
            </View>
          ))}
        </>
      )}

      <Text style={styles.footNote}>
        Los pagos se procesan con Mercado Pago. Al completar el pago vuelves al mapa con las nuevas rutas desbloqueadas.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
  },
  backText: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  title: { fontFamily: serif, fontSize: 26, color: colors.onSurface },
  sub: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceSecondary },
  error: { color: colors.error, fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cardAll: { borderColor: colors.brand, borderWidth: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontFamily: serif, fontSize: 18, color: colors.onSurface, flex: 1 },
  cardDesc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  priceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  priceText: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
  priceBadgeSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  priceTextSm: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  buyBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buyText: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
  buyBtn2: {
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buyText2: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  footNote: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: spacing.lg, textAlign: "center" },
});
