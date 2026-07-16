import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  checkPaymentStatus,
  clearPendingSession,
  setLocalPaid,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const MAX_ATTEMPTS = 12;

export default function PaymentSuccess() {
  const params = useLocalSearchParams<{ tx?: string; session_id?: string }>();
  const txId = params.tx || params.session_id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"verifying" | "paid" | "expired" | "error">("verifying");
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
          await setLocalPaid();
          await clearPendingSession();
          setState("paid");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {state === "verifying" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.title}>Verificando tu pago...</Text>
          <Text style={styles.sub}>No cierres esta pantalla.</Text>
        </View>
      )}

      {state === "paid" && (
        <>
          <View style={styles.iconCircle}>
            <Feather name="check" size={36} color={colors.onBrand} />
          </View>
          <Text style={styles.title}>¡Iorana! Pago exitoso</Text>
          <Text style={styles.sub}>
            Ya tienes acceso a la guía en este dispositivo. Vas a poder usarla para descubrir Rapa Nui.
            Escoge tu paquete de rutas. Cuando quieras, puedes desbloquear más paquetes o todas las rutas.
          </Text>

          <View style={styles.infoCard}>
            <Feather name="info" size={16} color={colors.info} />
            <Text style={styles.infoText}>
              Acceso válido por 30 días en este dispositivo. Si cierras la app o pasa el tiempo,
              solo escribes tu email para volver a entrar.
            </Text>
          </View>

          <Pressable
            style={styles.cta}
            onPress={() => router.replace("/select-package")}
            testID="choose-package"
          >
            <Text style={styles.ctaText}>Elegir mi paquete de rutas</Text>
          </Pressable>
        </>
      )}

      {state === "expired" && (
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
            <Feather name="clock" size={32} color={colors.onSurface} />
          </View>
          <Text style={styles.title}>La sesión de pago expiró</Text>
          <Text style={styles.sub}>No se realizó ningún cobro. Puedes intentarlo de nuevo.</Text>
          <Pressable style={styles.cta} onPress={() => router.replace("/")}>
            <Text style={styles.ctaText}>Volver a intentar</Text>
          </Pressable>
        </View>
      )}

      {state === "error" && (
        <View style={styles.centered}>
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
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  centered: { alignItems: "center", gap: spacing.md, justifyContent: "center", flex: 1 },
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
  infoCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
    width: "100%",
    marginTop: spacing.md,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 17 },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
});
