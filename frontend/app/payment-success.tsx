import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { checkPaymentStatus, checkUnlocked, clearPendingSession, getDeviceId, setLocalUnlocked } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const MAX_ATTEMPTS = 10;

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
  const attempts = useRef(0);

  useEffect(() => {
    if (!txId) {
      setState("error");
      return;
    }
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      attempts.current += 1;
      try {
        const st = await checkPaymentStatus(txId);
        if (cancelled) return;
        if (st.payment_status === "paid") {
          setProductId(st.product_id);
          try {
            const deviceId = await getDeviceId();
            const list = await checkUnlocked(deviceId);
            await setLocalUnlocked(list);
          } catch {}
          await clearPendingSession();
          setState("paid");
          return;
        }
        if (st.status === "expired") {
          await clearPendingSession();
          setState("expired");
          return;
        }
      } catch {
        // reintentar
      }
      if (attempts.current >= MAX_ATTEMPTS) {
        setState("error");
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, [txId]);

  const nextRoute = (productId && PRODUCT_ROUTE[productId]) || "/";

  return (
    <View style={styles.container}>
      {state === "verifying" && (
        <>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.title}>Verificando tu pago...</Text>
          <Text style={styles.sub}>No cierres esta pantalla.</Text>
        </>
      )}

      {state === "paid" && (
        <>
          <View style={styles.iconCircle}>
            <Feather name="check" size={36} color={colors.onBrand} />
          </View>
          <Text style={styles.title}>¡Iorana! Pago exitoso</Text>
          <Text style={styles.sub}>
            Ya tienes acceso al contenido que compraste en este dispositivo.
          </Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.replace(nextRoute as any)}
            testID="start-exploring"
          >
            <Text style={styles.ctaText}>Ver contenido</Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/")} hitSlop={12} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.onSurfaceSecondary, textDecorationLine: "underline" }}>Volver al inicio</Text>
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
          <View style={[styles.iconCircle, { backgroundColor: colors.error }]}>
            <Feather name="alert-triangle" size={30} color={colors.onBrand} />
          </View>
          <Text style={styles.title}>No pudimos confirmar el pago</Text>
          <Text style={styles.sub}>
            Si el cobro se realizó, usa «Restaurar acceso» en la pantalla inicial.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.replace("/")}>
            <Text style={styles.ctaText}>Volver al inicio</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: serif,
    fontSize: 26,
    color: colors.onSurface,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
});
