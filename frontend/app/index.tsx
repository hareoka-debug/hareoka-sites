import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Providers,
  checkAccess,
  checkPaymentStatus,
  clearPendingSession,
  createCheckout,
  fetchProviders,
  getDeviceId,
  getLocalPaid,
  getPendingSession,
  setLocalPaid,
  setPendingSession,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const HERO =
  "https://images.unsplash.com/photo-1597240890437-6d9c2d4c16aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHxFYXN0ZXIlMjBJc2xhbmQlMjBNb2FpJTIwc3RhdHVlJTIwbGFuZHNjYXBlfGVufDB8fHx8MTc4MzI4MzEyNXww&ixlib=rb-4.1.0&q=85";

const BULLETS: { icon: any; text: string }[] = [
  { icon: "map", text: "11 rutas urbanas y rurales con mapa interactivo" },
  { icon: "droplet", text: "Puntos Vai: dónde comprar agua VAINATIVA en cada ruta" },
  { icon: "compass", text: "Moáis, playas y sitios arqueológicos con todo detalle" },
];

const METHODS: { key: string; label: string; sub: string; icon: any }[] = [
  { key: "mercadopago", label: "Mercado Pago", sub: "Tarjetas, saldo MP", icon: "smartphone" },
  { key: "flow", label: "Flow", sub: "Webpay, transferencia", icon: "credit-card" },
  { key: "stripe", label: "Tarjeta int.", sub: "Visa, Mastercard", icon: "globe" },
];

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [paying, setPaying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [method, setMethod] = useState<string>("mercadopago");
  const [email, setEmail] = useState("");

  const verifyAccess = useCallback(async (): Promise<boolean> => {
    const localPaid = await getLocalPaid();
    if (localPaid) return true;
    const deviceId = await getDeviceId();

    // ¿Hay un pago pendiente de una sesión anterior?
    const pending = await getPendingSession();
    if (pending) {
      try {
        const st = await checkPaymentStatus(pending);
        if (st.payment_status === "paid") {
          await setLocalPaid();
          await clearPendingSession();
          return true;
        }
        if (st.status === "expired") await clearPendingSession();
      } catch {
        // ignorar, se reintenta con checkAccess
      }
    }

    try {
      const paid = await checkAccess(deviceId);
      if (paid) {
        await setLocalPaid();
        return true;
      }
    } catch {
      // sin conexión: se queda en paywall
    }
    return false;
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await verifyAccess();
      if (ok) {
        router.replace("/map");
      } else {
        setChecking(false);
        try {
          const p = await fetchProviders();
          setProviders(p);
          if (!p.mercadopago) setMethod(p.flow ? "flow" : "stripe");
        } catch {
          // se muestran todos por defecto
        }
      }
    })();
  }, [verifyAccess, router]);

  const handlePay = async () => {
    setError(null);
    if (method === "flow" && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Ingresa un email válido para el comprobante de Flow.");
      return;
    }
    setPaying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const deviceId = await getDeviceId();
      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : (process.env.EXPO_PUBLIC_BACKEND_URL as string);
      const { url, tx_id } = await createCheckout(deviceId, origin, method, email.trim() || undefined);
      await setPendingSession(tx_id);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
        return;
      }
      await WebBrowser.openBrowserAsync(url);
      // Al volver del navegador, verificar si pagó
      const ok = await verifyAccess();
      if (ok) router.replace("/map");
    } catch (e: any) {
      setError(e?.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setPaying(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    const ok = await verifyAccess();
    if (ok) {
      router.replace("/map");
    } else {
      setError("No encontramos un pago para este dispositivo.");
    }
    setRestoring(false);
  };

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Verificando...</Text>
      </View>
    );
  }

  const available = METHODS.filter((m) => !providers || (providers as any)[m.key]);

  return (
    <View style={styles.container}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(43,58,66,0.15)", "rgba(43,58,66,0.55)", "rgba(43,58,66,0.96)"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl, paddingTop: insets.top + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1 }} />
          <Text style={styles.eyebrow}>GUÍA DE SENDEROS · ISLA DE PASCUA</Text>
          <Text style={styles.headline}>Descubre{"\n"}Rapa Nui</Text>
          <Text style={styles.sub}>
            Todas las rutas urbanas y rurales registradas de la isla, en tu bolsillo.
          </Text>

          <View style={styles.bullets}>
            {BULLETS.map((b) => (
              <View key={b.icon} style={styles.bulletRow}>
                <View style={styles.bulletIcon}>
                  <Feather name={b.icon} size={16} color={colors.onSurfaceInverse} />
                </View>
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.methodLabel}>ELIGE TU MEDIO DE PAGO</Text>
          <View style={styles.methods}>
            {available.map((m) => {
              const active = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  style={[styles.methodCard, active && styles.methodCardActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMethod(m.key);
                    setError(null);
                  }}
                  testID={`method-${m.key}`}
                >
                  <Feather name={m.icon} size={18} color={active ? colors.brand : colors.onSurfaceInverse} />
                  <Text style={[styles.methodName, active && { color: colors.brand }]}>{m.label}</Text>
                  <Text style={styles.methodSub}>{m.sub}</Text>
                </Pressable>
              );
            })}
          </View>

          {method === "flow" ? (
            <TextInput
              style={styles.emailInput}
              placeholder="Tu email (para el comprobante)"
              placeholderTextColor="rgba(249,248,246,0.5)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="flow-email-input"
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            onPress={handlePay}
            disabled={paying}
            testID="unlock-button"
          >
            {paying ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.ctaText}>Desbloquear Guía — $3.000 CLP</Text>
            )}
          </Pressable>
          <Text style={styles.finePrint}>Pago único por dispositivo · Pago seguro · Sin suscripciones</Text>

          <Pressable onPress={handleRestore} disabled={restoring} hitSlop={12} style={styles.restore}>
            <Text style={styles.restoreText}>
              {restoring ? "Verificando..." : "¿Ya pagaste en este dispositivo? Restaurar acceso"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
  loading: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  content: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xl,
  },
  eyebrow: {
    color: colors.warning,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  headline: {
    fontFamily: serif,
    fontSize: 46,
    lineHeight: 50,
    color: colors.onSurfaceInverse,
    marginBottom: spacing.md,
  },
  sub: {
    color: "rgba(249,248,246,0.85)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  bullets: { gap: spacing.md, marginBottom: spacing.xl },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(179,93,74,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: { color: colors.onSurfaceInverse, fontSize: 14, flex: 1, lineHeight: 20 },
  methodLabel: {
    color: "rgba(249,248,246,0.7)",
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  methods: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  methodCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "rgba(249,248,246,0.35)",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 3,
    minHeight: 78,
    justifyContent: "center",
  },
  methodCardActive: {
    borderColor: colors.brand,
    backgroundColor: "rgba(249,248,246,0.95)",
  },
  methodName: { color: colors.onSurfaceInverse, fontSize: 13, fontWeight: "700" },
  methodSub: { color: "rgba(150,158,166,0.95)", fontSize: 10, textAlign: "center" },
  emailInput: {
    borderWidth: 1.5,
    borderColor: "rgba(249,248,246,0.35)",
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    color: colors.onSurfaceInverse,
    fontSize: 14,
    marginBottom: spacing.md,
    backgroundColor: "rgba(43,58,66,0.4)",
  },
  error: { color: "#F2B8B5", fontSize: 13, marginBottom: spacing.sm },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
  finePrint: {
    color: "rgba(249,248,246,0.6)",
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.md,
  },
  restore: { alignSelf: "center", marginTop: spacing.lg, minHeight: 44, justifyContent: "center" },
  restoreText: {
    color: "rgba(249,248,246,0.85)",
    fontSize: 13,
    textDecorationLine: "underline",
  },
});

