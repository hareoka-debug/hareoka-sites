import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import {
  Product,
  Providers,
  createCheckout,
  fetchProviders,
  getDeviceId,
  setPendingSession,
} from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";
import { clpLong } from "@/src/lib/i18n";

const METHODS: { key: string; label: string; sub: string; icon: any }[] = [
  { key: "mercadopago", label: "Mercado Pago", sub: "Tarjetas, saldo MP", icon: "smartphone" },
  { key: "flow", label: "Flow", sub: "Webpay, transferencia", icon: "credit-card" },
  { key: "stripe", label: "Tarjeta int.", sub: "Visa, Mastercard", icon: "globe" },
];

interface Props {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
}

export default function BuyModal({ product, visible, onClose }: Props) {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [method, setMethod] = useState("mercadopago");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const saved = await storage.getItem("rapa-nui-email", "");
      if (saved) setEmail(saved as string);
      try {
        const p = await fetchProviders();
        setProviders(p);
        if (!p.mercadopago) setMethod(p.flow ? "flow" : "stripe");
      } catch {}
    })();
  }, [visible]);

  const handlePay = useCallback(async () => {
    if (!product) return;
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Ingresa un email válido.");
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      await storage.setItem("rapa-nui-email", email.trim().toLowerCase());
      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : (process.env.EXPO_PUBLIC_BACKEND_URL as string);
      const { url, tx_id } = await createCheckout(deviceId, origin, method, product.id, email.trim());
      await setPendingSession(tx_id);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
        return;
      }
      await WebBrowser.openBrowserAsync(url);
      onClose();
    } catch (e: any) {
      setError(e?.message || "No se pudo iniciar el pago.");
    } finally {
      setLoading(false);
    }
  }, [product, email, method, onClose]);

  if (!product) return null;
  const available = METHODS.filter((m) => !providers || (providers as any)[m.key]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={styles.imgWrap}>
                <Image source={{ uri: product.image }} style={styles.img} />
                <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFill} />
                <Pressable style={styles.grabber} onPress={onClose}>
                  <Feather name="chevron-down" size={20} color={colors.onSurfaceSecondary} />
                </Pressable>
                <View style={styles.priceBadge}><Text style={styles.priceBadgeText}>{clpLong(product.amount_clp)}</Text></View>
              </View>

              <View style={styles.body}>
                <Text style={styles.title}>{product.name}</Text>
                <Text style={styles.desc}>{product.description}</Text>
                <Text style={styles.descEn}>{product.description_en}</Text>

                <Text style={styles.label}>Elige medio de pago · <Text style={styles.labelEn}>Choose payment</Text></Text>
                <View style={styles.methods}>
                  {available.map((m) => {
                    const active = method === m.key;
                    return (
                      <Pressable
                        key={m.key}
                        style={[styles.methodCard, active && styles.methodCardActive]}
                        onPress={() => setMethod(m.key)}
                        {...(Platform.OS === "web" ? { dataSet: { notranslate: "true" } } : {})}
                      >
                        <Feather name={m.icon} size={18} color={active ? colors.brand : colors.onSurfaceSecondary} />
                        <Text
                          style={[styles.methodName, active && { color: colors.brand }]}
                          {...(Platform.OS === "web" ? { dataSet: { notranslate: "true" } } : {})}
                        >
                          {m.label}
                        </Text>
                        <Text style={styles.methodSub}>{m.sub}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Tu email (para respaldar tu compra) · <Text style={styles.labelEn}>Your email</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="tu@correo.com"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable style={styles.cta} onPress={handlePay} disabled={loading} testID="btn-pay">
                  {loading ? <ActivityIndicator color="#FFF" /> : (
                    <Text style={styles.ctaText}>Pagar · Pay {clpLong(product.amount_clp)}</Text>
                  )}
                </Pressable>
                <Text style={styles.foot}>Se abrirá la página segura del proveedor. Al volver, tu acceso queda activo.</Text>
                <Text style={styles.footEn}>You will be redirected to the payment provider. When you return, your access is active.</Text>

                <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
                  <Feather name="arrow-left" size={16} color={colors.onSurfaceSecondary} />
                  <Text style={styles.backText}>Volver · Back</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// En Web usamos dvh (dynamic viewport height) para respetar la barra de URL de iOS Safari,
// que hace que "100%" no llegue realmente al fondo visible. En native usamos porcentaje.
const WEB_MAX_HEIGHT: any = Platform.OS === "web" ? { maxHeight: "92dvh" as any, height: "92dvh" as any } : { maxHeight: "92%" as any };

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    ...(Platform.OS === "web" ? ({ height: "100dvh" as any } as any) : {}),
  },
  sheetWrap: { ...WEB_MAX_HEIGHT, width: "100%" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl + 24, flexGrow: 1 },
  imgWrap: { height: 180 },
  img: { width: "100%", height: "100%" },
  grabber: {
    position: "absolute", top: 8, alignSelf: "center", width: 44, height: 22,
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center",
  },
  priceBadge: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: "rgba(255,255,255,0.95)", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5,
  },
  priceBadgeText: { fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  desc: { fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },
  descEn: { fontSize: 13, color: colors.onSurfaceTertiary, fontStyle: "italic", lineHeight: 19 },
  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 1, marginTop: spacing.md, textTransform: "uppercase" },
  labelEn: { fontStyle: "italic", fontWeight: "600" },
  methods: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs },
  methodCard: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    alignItems: "center", gap: 3, minHeight: 78, justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  methodCardActive: { borderColor: colors.brand, backgroundColor: "#FFF" },
  methodName: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  methodSub: { fontSize: 10, color: colors.onSurfaceTertiary, textAlign: "center" },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    minHeight: 50, paddingHorizontal: spacing.md,
    fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  error: { color: colors.error, fontSize: 13 },
  cta: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.md,
  },
  ctaText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  foot: { fontSize: 12, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.sm },
  footEn: { fontSize: 11, color: colors.onSurfaceTertiary, fontStyle: "italic", textAlign: "center" },
  back: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 4, marginTop: spacing.lg, padding: 8 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 13 },
});
