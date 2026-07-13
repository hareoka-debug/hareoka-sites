import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MyPurchaseInfo,
  checkPaymentStatus,
  clearPendingSession,
  fetchMyPurchaseInfo,
  getDeviceId,
  setLocalPaid,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const MAX_ATTEMPTS = 10;

export default function PaymentSuccess() {
  const params = useLocalSearchParams<{ tx?: string; session_id?: string }>();
  const txId = params.tx || params.session_id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"verifying" | "paid" | "expired" | "error">("verifying");
  const [info, setInfo] = useState<MyPurchaseInfo | null>(null);
  const [copied, setCopied] = useState(false);
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
          // Cargar info completa con código de acceso
          try {
            const deviceId = await getDeviceId();
            const purchaseInfo = await fetchMyPurchaseInfo(deviceId);
            if (!cancelled) setInfo(purchaseInfo);
          } catch {
            /* silencioso */
          }
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

  const handleCopyCode = async () => {
    if (!info?.access_code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Clipboard.setStringAsync(info.access_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  const buildShareMessage = () => {
    if (!info) return "";
    return (
      `🗿 Descubre Rapa Nui — mi acceso a la guía\n\n` +
      `Email: ${info.email}\n` +
      `Código: ${info.access_code}\n\n` +
      `⚠️ Guarda este mensaje. Este código es tuyo y solo funcionará en hasta ${info.max_devices} dispositivos.`
    );
  };

  const handleShareWhatsApp = async () => {
    if (!info) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const msg = buildShareMessage();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(url, "_blank");
        return;
      }
      await Linking.openURL(url);
    } catch {
      // fallback: share nativo
      await Share.share({ message: msg }).catch(() => {});
    }
  };

  const handleShareGeneric = async () => {
    if (!info) return;
    const message = buildShareMessage();
    try {
      await Share.share({ message });
    } catch {
      /* ignore */
    }
  };

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
            Ya tienes acceso completo a todas las rutas urbanas y rurales de Rapa Nui en este dispositivo.
          </Text>

          {info?.access_code ? (
            <View style={styles.codeCard}>
              <View style={styles.codeBadge}>
                <Feather name="lock" size={12} color={colors.warning} />
                <Text style={styles.codeBadgeText}>TU CÓDIGO DE ACCESO</Text>
              </View>
              <Text style={styles.code} selectable testID="access-code">
                {info.access_code}
              </Text>
              <Text style={styles.emailLine}>
                para {info.email}
              </Text>

              <Text style={styles.codeExplain}>
                ⚠️ <Text style={styles.bold}>Guárdalo bien</Text>. Lo necesitarás para usar la app en
                tu tablet o computador (hasta {info.max_devices} dispositivos). Si lo pierdes,
                escríbenos con tu comprobante de pago.
              </Text>

              <View style={styles.actions}>
                <Pressable style={styles.copyBtn} onPress={handleCopyCode} testID="copy-code">
                  <Feather
                    name={copied ? "check" : "copy"}
                    size={16}
                    color={copied ? colors.success : colors.onSurface}
                  />
                  <Text style={styles.copyText}>{copied ? "Copiado" : "Copiar código"}</Text>
                </Pressable>
                <Pressable
                  style={styles.waBtn}
                  onPress={handleShareWhatsApp}
                  testID="share-whatsapp"
                >
                  <Feather name="message-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.waText}>Enviar por WhatsApp</Text>
                </Pressable>
                <Pressable style={styles.shareBtn} onPress={handleShareGeneric}>
                  <Feather name="share-2" size={16} color={colors.onSurfaceSecondary} />
                  <Text style={styles.shareText}>Otras apps</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            style={styles.cta}
            onPress={() => router.replace("/map")}
            testID="start-exploring"
          >
            <Text style={styles.ctaText}>Comenzar a explorar</Text>
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
  codeCard: {
    width: "100%",
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  codeBadge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(232,164,80,0.15)",
  },
  codeBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  code: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 42,
    fontWeight: "800",
    color: colors.onSurfaceInverse,
    letterSpacing: 10,
    paddingLeft: 10,
    marginTop: spacing.xs,
  },
  emailLine: {
    fontSize: 12,
    color: "rgba(249,248,246,0.65)",
    marginTop: -4,
  },
  codeExplain: {
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(249,248,246,0.85)",
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  bold: { fontWeight: "700", color: colors.onSurfaceInverse },
  actions: {
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  copyText: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: "#25D366",
  },
  waText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 40,
  },
  shareText: { fontSize: 13, color: colors.onSurfaceSecondary },
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
