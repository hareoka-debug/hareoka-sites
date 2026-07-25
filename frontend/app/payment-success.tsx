import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  checkPaymentStatus,
  checkUnlocked,
  clearPendingSession,
  fetchProducts,
  getDeviceId,
  restoreByEmail,
  setLocalUnlocked,
} from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

// Polling: 2s por 20 intentos (40s), luego 4s por 20 intentos (80s) = 2 minutos total.
// Este tiempo cubre demoras normales de Flow (que puede tardar 2-3 min en confirmar).
const FAST_ATTEMPTS = 20;
const SLOW_ATTEMPTS = 20;
const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 4000;

const PRODUCT_ROUTE: Record<string, string> = {
  "routes-3": "/map",
  "routes-all": "/map",
  agencies: "/agencies",
  restaurants: "/restaurants",
  rentcars: "/rentcars",
  song: "/song",
};

export default function PaymentSuccess() {
  const params = useLocalSearchParams<{ tx?: string; session_id?: string }>();
  const txId = params.tx || params.session_id;
  const router = useRouter();
  const [state, setState] = useState<"verifying" | "paid" | "expired" | "error">("verifying");
  const [productId, setProductId] = useState<string | undefined>();
  const [productName, setProductName] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(3);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const attempts = useRef(0);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar nombre del producto (por si el usuario ve la pantalla de espera)
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProducts();
        // Guardamos referencia rápida id->nombre
        (window as any).__productMap = Object.fromEntries(list.map((p) => [p.id, p.name]));
      } catch {}
      const saved = await storage.getItem("rapa-nui-email", "");
      if (saved) setRestoreEmail(saved as string);
    })();
  }, []);

  useEffect(() => {
    if (!txId) { setState("error"); return; }
    let cancelled = false;

    const finishAsPaid = async (pid?: string) => {
      if (cancelled) return;
      if (pid) setProductId(pid);
      const name = pid && (window as any).__productMap?.[pid];
      if (name) setProductName(name);
      try {
        const deviceId = await getDeviceId();
        const list = await checkUnlocked(deviceId);
        await setLocalUnlocked(list);
      } catch {}
      await clearPendingSession();
      setState("paid");

      // Auto-redirect a la pantalla del producto tras 3 segundos
      let n = 3;
      setCountdown(n);
      const tick = () => {
        n -= 1;
        setCountdown(n);
        if (n <= 0) {
          const target = (pid && PRODUCT_ROUTE[pid]) || "/";
          router.replace(target as any);
        } else {
          redirectTimer.current = setTimeout(tick, 1000);
        }
      };
      redirectTimer.current = setTimeout(tick, 1000);
    };

    const poll = async () => {
      if (cancelled) return;
      attempts.current += 1;
      try {
        const st = await checkPaymentStatus(txId);
        if (cancelled) return;
        if (st.payment_status === "paid") {
          await finishAsPaid(st.product_id);
          return;
        }
        if (st.status === "expired") {
          await clearPendingSession();
          setState("expired");
          return;
        }
      } catch { /* reintentar */ }

      const total = FAST_ATTEMPTS + SLOW_ATTEMPTS;
      if (attempts.current >= total) {
        // Antes de rendirse: intentar un restore automático con el último email guardado
        try {
          const savedEmail = await storage.getItem("rapa-nui-email", "");
          if (savedEmail) {
            const deviceId = await getDeviceId();
            const list = await restoreByEmail(savedEmail as string, deviceId);
            if (list.length > 1) {
              await setLocalUnlocked(list);
              await clearPendingSession();
              await finishAsPaid();
              return;
            }
          }
        } catch {}
        setState("error");
        return;
      }
      const interval = attempts.current <= FAST_ATTEMPTS ? FAST_INTERVAL : SLOW_INTERVAL;
      setTimeout(poll, interval);
    };
    poll();

    return () => {
      cancelled = true;
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [txId, router]);

  const handleRestore = useCallback(async () => {
    setRestoreMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(restoreEmail.trim())) {
      setRestoreMsg("Ingresa el email con el que pagaste.");
      return;
    }
    setRestoreLoading(true);
    try {
      const deviceId = await getDeviceId();
      const list = await restoreByEmail(restoreEmail.trim().toLowerCase(), deviceId);
      if (list.length <= 1) {
        setRestoreMsg("No encontramos ninguna compra con ese email. Si acabas de pagar, espera 1 minuto y reintenta.");
        return;
      }
      await storage.setItem("rapa-nui-email", restoreEmail.trim().toLowerCase());
      await setLocalUnlocked(list);
      await clearPendingSession();
      // Encontramos un producto pagado — redirigir al primero desbloqueado
      const first = list.find((p) => p !== "emergencies");
      const target = (first && PRODUCT_ROUTE[first]) || "/";
      router.replace(target as any);
    } catch (e: any) {
      setRestoreMsg(e?.message || "No se pudo verificar. Intenta de nuevo.");
    } finally {
      setRestoreLoading(false);
    }
  }, [restoreEmail, router]);

  const goProduct = () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    const target = (productId && PRODUCT_ROUTE[productId]) || "/";
    router.replace(target as any);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {state === "verifying" && (
        <>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.title}>Verificando tu pago…</Text>
          <Text style={styles.sub}>
            Estamos confirmando el pago con tu banco. Esto puede tardar hasta 2 minutos.
            {"\n"}No cierres esta pantalla.
          </Text>
          <View style={styles.progressBox}>
            <Text style={styles.progressText}>Intento {attempts.current} de {FAST_ATTEMPTS + SLOW_ATTEMPTS}</Text>
          </View>
        </>
      )}

      {state === "paid" && (
        <>
          <View style={styles.iconCircle}>
            <Feather name="check" size={36} color={colors.onBrand} />
          </View>
          <Text style={styles.title}>¡Iorana! Pago exitoso</Text>
          <Text style={styles.sub}>
            {productName ? `Ya tienes acceso a "${productName}".` : "Ya tienes acceso al contenido que compraste."}
            {"\n"}Entrando en {countdown}…
          </Text>
          <Pressable style={styles.cta} onPress={goProduct} testID="start-exploring">
            <Text style={styles.ctaText}>Entrar ahora</Text>
            <Feather name="arrow-right" size={18} color={colors.onBrand} />
          </Pressable>
          <Pressable onPress={() => router.replace("/")} hitSlop={12} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Volver al inicio</Text>
          </Pressable>
        </>
      )}

      {state === "expired" && (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
            <Feather name="clock" size={32} color={colors.onSurface} />
          </View>
          <Text style={styles.title}>La sesión de pago expiró</Text>
          <Text style={styles.sub}>No se realizó ningún cobro. Puedes intentarlo de nuevo.</Text>
          <Pressable style={styles.cta} onPress={() => router.replace("/")}>
            <Text style={styles.ctaText}>Volver a intentar</Text>
          </Pressable>
        </>
      )}

      {state === "error" && (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
            <Feather name="alert-triangle" size={28} color={colors.onSurface} />
          </View>
          <Text style={styles.title}>Aún no confirmamos tu pago</Text>
          <Text style={styles.sub}>
            Si el cobro apareció en tu banco o tarjeta, ingresa aquí el email con el que pagaste y entramos de inmediato.
          </Text>
          <View style={styles.restoreBox}>
            <TextInput
              style={styles.input}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={restoreEmail}
              onChangeText={setRestoreEmail}
            />
            {restoreMsg && <Text style={styles.errorMsg}>{restoreMsg}</Text>}
            <Pressable style={styles.cta} onPress={handleRestore} disabled={restoreLoading}>
              {restoreLoading ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Feather name="refresh-cw" size={16} color={colors.onBrand} />
                  <Text style={styles.ctaText}>Restaurar mi acceso</Text>
                </>
              )}
            </Pressable>
          </View>
          <Pressable onPress={() => router.replace("/")} hitSlop={12}>
            <Text style={styles.link}>Volver al inicio</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: serif, fontSize: 26, color: colors.onSurface, textAlign: "center" },
  sub: { fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary, textAlign: "center" },
  progressBox: { marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 },
  progressText: { fontSize: 12, color: colors.onSurfaceTertiary },
  cta: {
    flexDirection: "row", gap: 6,
    backgroundColor: colors.brand, borderRadius: radius.pill,
    minHeight: 52, paddingHorizontal: spacing.xxl,
    alignItems: "center", justifyContent: "center",
    marginTop: spacing.md,
  },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
  link: { color: colors.onSurfaceSecondary, textDecorationLine: "underline" },
  restoreBox: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    minHeight: 50, paddingHorizontal: spacing.md,
    fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  errorMsg: { color: colors.error, fontSize: 13, textAlign: "center" },
});
