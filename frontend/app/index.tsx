import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

import BuyModal from "@/src/components/BuyModal";
import RestoreModal from "@/src/components/RestoreModal";
import ProductCard from "@/src/components/ProductCard";
import {
  Product,
  checkPaymentStatus,
  checkUnlocked,
  clearPendingSession,
  fetchProducts,
  getDeviceId,
  getLocalUnlocked,
  getPendingSession,
  setLocalUnlocked,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const HERO = "https://images.unsplash.com/photo-1597240890437-6d9c2d4c16aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHxFYXN0ZXIlMjBJc2xhbmQlMjBNb2FpJTIwc3RhdHVlJTIwbGFuZHNjYXBlfGVufDB8fHx8MTc4MzI4MzEyNXww&ixlib=rb-4.1.0&q=85";

const ROUTE_MAP: Record<string, string> = {
  "routes-3": "/map",
  "routes-all": "/map",
  agencies: "/agencies",
  restaurants: "/restaurants",
  rentcars: "/rentcars",
  song: "/song",
  emergencies: "/emergencies",
};

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [unlocked, setUnlocked] = useState<string[]>(["emergencies"]);
  const [loading, setLoading] = useState(true);
  const [buyProduct, setBuyProduct] = useState<Product | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const refreshAccess = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const list = await checkUnlocked(deviceId);
      setUnlocked(list);
      await setLocalUnlocked(list);
    } catch {
      const local = await getLocalUnlocked();
      setUnlocked(local);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        try { (navigator as any).storage?.persist?.(); } catch {}
      }
      try {
        const list = await fetchProducts();
        setProducts(list);
      } catch {}

      // verificar pago pendiente (regreso del checkout)
      const pending = await getPendingSession();
      if (pending) {
        try {
          const st = await checkPaymentStatus(pending);
          if (st.payment_status === "paid") await clearPendingSession();
        } catch {}
      }
      await refreshAccess();
      setLoading(false);
    })();
  }, [refreshAccess]);

  const handleProductPress = useCallback((p: Product) => {
    const isUnlocked = p.always_free || unlocked.includes(p.id);
    if (isUnlocked) {
      const target = ROUTE_MAP[p.id];
      if (p.id === "routes-3") router.push({ pathname: "/map", params: { plan: "3" } });
      else if (target) router.push(target as any);
      return;
    }
    setBuyProduct(p);
  }, [unlocked, router]);

  const openAdmin = () => router.push("/admin");

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {/* HERO */}
        <Pressable onLongPress={openAdmin} delayLongPress={900}>
          <View style={styles.hero}>
            <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={["rgba(43,58,66,0.35)", "rgba(43,58,66,0.75)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
              <Text style={styles.eyebrow}>GUÍA DE ISLA DE PASCUA · EASTER ISLAND GUIDE</Text>
              <Text style={styles.headline}>Descubre{"\n"}Rapa Nui</Text>
              <Text style={styles.headlineEn}>Discover Rapa Nui</Text>
              <Text style={styles.sub}>Elige el contenido que quieres desbloquear y vive la experiencia</Text>
              <Text style={styles.subEn}>Choose what you want to unlock and live the experience</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.list}>
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              unlocked={p.always_free || unlocked.includes(p.id)}
              onPress={() => handleProductPress(p)}
            />
          ))}

          <Pressable style={styles.restoreBtn} onPress={() => setRestoreOpen(true)} hitSlop={12}>
            <Feather name="refresh-cw" size={14} color={colors.brand} />
            <Text style={styles.restoreText}>¿Ya pagaste antes? Restaurar acceso con tu email</Text>
          </Pressable>
          <Text style={styles.restoreTextEn}>Already paid? Restore access with your email</Text>

          <View style={styles.footer}>
            <Text style={styles.footNote}>Pago único por dispositivo · Pago seguro · Sin suscripciones</Text>
            <Text style={styles.footNoteEn}>One-time payment per device · Secure payment · No subscriptions</Text>
            <Pressable
              onPress={openAdmin}
              hitSlop={16}
              testID="admin-entry"
              accessibilityLabel="Panel de administrador"
              style={styles.copyPressable}
            >
              <Text style={styles.copy}>© Todos los derechos reservados · All rights reserved</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <BuyModal
        visible={!!buyProduct}
        product={buyProduct}
        onClose={() => setBuyProduct(null)}
      />
      <RestoreModal
        visible={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onRestored={(list) => setUnlocked(list)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: { height: 300, position: "relative" },
  heroContent: { position: "absolute", left: spacing.xl, right: spacing.xl, top: 0, bottom: spacing.lg, justifyContent: "flex-start", gap: 4 },
  eyebrow: { color: colors.warning, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.sm },
  headline: { fontFamily: serif, fontSize: 42, lineHeight: 46, color: "#FFF" },
  headlineEn: { fontFamily: serif, fontStyle: "italic", fontSize: 20, color: "rgba(255,255,255,0.85)", marginBottom: spacing.sm },
  sub: { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 20 },
  subEn: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontStyle: "italic", lineHeight: 18 },
  list: { padding: spacing.lg, marginTop: -spacing.lg },
  restoreBtn: { flexDirection: "row", gap: 6, alignSelf: "center", alignItems: "center", marginTop: spacing.md, padding: 8 },
  restoreText: { color: colors.brand, fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
  restoreTextEn: { color: colors.onSurfaceSecondary, fontSize: 12, alignSelf: "center", fontStyle: "italic", marginTop: 2 },
  footer: { alignItems: "center", marginTop: spacing.xl, gap: 4 },
  footNote: { color: colors.onSurfaceSecondary, fontSize: 12 },
  footNoteEn: { color: colors.onSurfaceTertiary, fontSize: 11, fontStyle: "italic" },
  copyPressable: { marginTop: spacing.sm, paddingVertical: 8, paddingHorizontal: 16 },
  copy: { color: colors.onSurfaceTertiary, fontSize: 11 },
});
