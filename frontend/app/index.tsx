import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AccessInfo,
  Product,
  Providers,
  checkAccessDetailed,
  checkPaymentStatus,
  clearPendingSession,
  createCheckout,
  fetchProducts,
  fetchProviders,
  getDeviceId,
  getPendingSession,
  setPendingSession,
  verifyEmailOnly,
} from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1597240890437-6d9c2d4c16aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHxFYXN0ZXIlMjBJc2xhbmQlMjBNb2FpJTIwc3RhdHVlJTIwbGFuZHNjYXBlfGVufDB8fHx8MTc4MzI4MzEyNXww&ixlib=rb-4.1.0&q=85";

const METHODS: { key: string; label: string; sub: string; icon: any }[] = [
  { key: "mercadopago", label: "Mercado Pago", sub: "Tarjetas, saldo MP", icon: "smartphone" },
  { key: "flow", label: "Flow", sub: "Webpay, transferencia", icon: "credit-card" },
  { key: "stripe", label: "Tarjeta int.", sub: "Visa, Mastercard", icon: "globe" },
];

const PRODUCT_ROUTE: Record<string, string> = {
  "routes-3": "/map",
  "routes-all": "/map",
  agencies: "/agencies",
  restaurants: "/restaurants",
  rentcars: "/rentcars",
  song: "/song",
  emergencies: "/emergencies",
};

const PRODUCT_ICON: Record<string, any> = {
  "routes-3": "map",
  "routes-all": "compass",
  agencies: "briefcase",
  restaurants: "coffee",
  rentcars: "truck",
  song: "music",
  emergencies: "alert-triangle",
};

export default function Hub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");

  // Modal de pago
  const [buying, setBuying] = useState<Product | null>(null);
  const [buyEmail, setBuyEmail] = useState("");
  const [buyMethod, setBuyMethod] = useState<string>("mercadopago");
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Modal de restauración
  const [showRestore, setShowRestore] = useState(false);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Cargar todo
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dev = await getDeviceId();
      setDeviceId(dev);
      const [prodRes, provRes, accRes] = await Promise.all([
        fetchProducts(),
        fetchProviders().catch(() => null),
        checkAccessDetailed(dev).catch(() => null),
      ]);
      setProducts(prodRes.products);
      setProviders(provRes);
      setAccess(accRes);

      // ¿Hay un pago pendiente de la sesión anterior?
      const pending = await getPendingSession();
      if (pending) {
        try {
          const st = await checkPaymentStatus(pending);
          if (st.payment_status === "paid") {
            await clearPendingSession();
            const acc = await checkAccessDetailed(dev);
            setAccess(acc);
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      try {
        (navigator as any).storage?.persist?.();
      } catch {
        /* ignore */
      }
    }
  }, [load]);

  const originUrl = Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_BACKEND_URL as string) || "";

  const ownedProducts = new Set(access?.owned_products || ["emergencies"]);
  const emailKnown = access?.email || "";

  const openProduct = (p: Product) => {
    if (ownedProducts.has(p.id) || p.amount_clp === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(PRODUCT_ROUTE[p.id] || "/");
      return;
    }
    setBuyEmail(emailKnown);
    setBuyMethod("mercadopago");
    setBuyError(null);
    setBuying(p);
  };

  const submitBuy = async () => {
    if (!buying) return;
    const em = buyEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      setBuyError("Ingresa un email válido.");
      return;
    }
    setBuyBusy(true);
    setBuyError(null);
    try {
      const res = await createCheckout(deviceId, em, buying.id, buyMethod, originUrl);
      await setPendingSession(res.tx_id);
      await storage.setItem("rapa-nui-email", em);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (Platform.OS === "web") {
        window.location.href = res.url;
      } else {
        await WebBrowser.openBrowserAsync(res.url);
      }
    } catch (e: any) {
      setBuyError(e?.message || "No se pudo iniciar el pago.");
    } finally {
      setBuyBusy(false);
    }
  };

  const submitRestore = async () => {
    const em = restoreEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      setRestoreError("Ingresa un email válido.");
      return;
    }
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const res = await verifyEmailOnly(deviceId, em);
      if (res.verified) {
        await storage.setItem("rapa-nui-email", em);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowRestore(false);
        await load();
      } else if (res.reason === "wrong_device") {
        setRestoreError(
          res.message || "Esta compra fue desde otro dispositivo. La app se usa solo donde pagaste.",
        );
      } else {
        setRestoreError("No encontramos compras con ese email.");
      }
    } catch (e: any) {
      setRestoreError(e?.message || "Error de conexión.");
    } finally {
      setRestoreBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xxxl,
        }}
      >
        {/* Imagen hero de moais */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImg} contentFit="cover" />
          <View style={styles.heroOverlay} />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xxl }]}>
            <Text style={styles.heroEyebrow}>GUÍA DE ISLA DE PASCUA</Text>
            <Text style={styles.heroTitle}>Descubre{"\n"}Rapa Nui</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
        {/* Encabezado */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Elige el contenido que quieres desbloquear. Cada compra es única: 1 email, 1 dispositivo, 30 días de acceso.
          </Text>
          {emailKnown ? (
            <View style={styles.emailBadge}>
              <Feather name="check-circle" size={13} color={colors.success} />
              <Text style={styles.emailBadgeText}>Sesión activa: {emailKnown}</Text>
            </View>
          ) : null}
        </View>

        {/* Productos */}
        {products.map((p) => {
          const owned = ownedProducts.has(p.id);
          const isFree = p.amount_clp === 0;
          return (
            <Pressable
              key={p.id}
              onPress={() => openProduct(p)}
              style={({ pressed }) => [
                styles.card,
                { borderLeftColor: p.color },
                pressed && { opacity: 0.85 },
              ]}
              testID={`product-${p.id}`}
            >
              <View style={[styles.cardIcon, { backgroundColor: `${p.color}22` }]}>
                <Feather name={PRODUCT_ICON[p.id] || "box"} size={22} color={p.color} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {owned || isFree ? (
                    <View style={[styles.tag, styles.tagOk]}>
                      <Feather name="unlock" size={11} color={colors.onBrand} />
                      <Text style={styles.tagOkText}>{isFree ? "GRATIS" : "ACTIVO"}</Text>
                    </View>
                  ) : (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>${p.amount_clp.toLocaleString("es-CL")}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardShort} numberOfLines={2}>
                  {p.short}
                </Text>
                <View style={styles.cardAction}>
                  <Text style={[styles.cardActionText, { color: p.color }]}>
                    {owned || isFree ? "Ver contenido" : "Comprar acceso"}
                  </Text>
                  <Feather name="chevron-right" size={16} color={p.color} />
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Restaurar acceso */}
        <Pressable
          onPress={() => {
            setShowRestore(true);
            setRestoreError(null);
            setRestoreEmail(emailKnown);
          }}
          style={styles.restoreBtn}
          testID="restore-button"
        >
          <Feather name="key" size={14} color={colors.onSurfaceSecondary} />
          <Text style={styles.restoreText}>¿Ya pagaste antes? Restaurar acceso con tu email</Text>
        </Pressable>

        <Text style={styles.footer}>
          Pago único por dispositivo · Pago seguro · Sin suscripciones
        </Text>
        </View>
      </ScrollView>

      {/* MODAL COMPRA */}
      <Modal
        visible={!!buying}
        animationType="slide"
        transparent
        onRequestClose={() => setBuying(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{buying?.name}</Text>
              <Pressable onPress={() => setBuying(null)} hitSlop={12}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>{buying?.description}</Text>
            <Text style={styles.modalPrice}>
              Precio: <Text style={{ fontWeight: "800" }}>${buying?.amount_clp.toLocaleString("es-CL")} CLP</Text>
            </Text>

            <Text style={styles.label}>Elige medio de pago</Text>
            <View style={styles.methods}>
              {METHODS.map((m) => {
                const enabled = providers?.[m.key as keyof Providers] !== false;
                const active = buyMethod === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => enabled && setBuyMethod(m.key)}
                    style={[
                      styles.methodBtn,
                      active && styles.methodBtnActive,
                      !enabled && { opacity: 0.4 },
                    ]}
                    testID={`method-${m.key}`}
                  >
                    <Feather
                      name={m.icon}
                      size={18}
                      color={active ? colors.brand : colors.onSurfaceSecondary}
                    />
                    <Text style={[styles.methodLabel, active && { color: colors.brand }]}>
                      {m.label}
                    </Text>
                    <Text style={styles.methodSub}>{m.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Tu email (para respaldar tu compra)</Text>
            <TextInput
              value={buyEmail}
              onChangeText={setBuyEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              testID="buy-email"
            />
            {buyError ? <Text style={styles.errorText}>{buyError}</Text> : null}

            <Pressable
              onPress={submitBuy}
              disabled={buyBusy}
              style={[styles.payBtn, buyBusy && { opacity: 0.6 }]}
              testID="buy-submit"
            >
              {buyBusy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.payBtnText}>
                  Pagar ${buying?.amount_clp.toLocaleString("es-CL")} CLP
                </Text>
              )}
            </Pressable>
            <Text style={styles.modalHint}>
              Se abrirá la página segura de {METHODS.find((x) => x.key === buyMethod)?.label}. Al volver, tu acceso queda activo.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL RESTAURAR */}
      <Modal
        visible={showRestore}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRestore(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Restaurar acceso</Text>
              <Pressable onPress={() => setShowRestore(false)} hitSlop={12}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Ingresa el email con el que pagaste. Renovamos tu sesión por 30 días en este dispositivo.
            </Text>
            <TextInput
              value={restoreEmail}
              onChangeText={setRestoreEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              testID="restore-email-input"
            />
            {restoreError ? <Text style={styles.errorText}>{restoreError}</Text> : null}
            <Pressable
              onPress={submitRestore}
              disabled={restoreBusy}
              style={[styles.payBtn, restoreBusy && { opacity: 0.6 }]}
              testID="restore-submit"
            >
              {restoreBusy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.payBtnText}>Verificar y entrar</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  hero: {
    height: 260,
    position: "relative",
    marginBottom: 0,
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(43, 58, 66, 0.35)",
  },
  heroContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: "flex-end",
    paddingBottom: spacing.lg,
  },
  heroEyebrow: {
    color: "#FFD9B8",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  heroTitle: {
    fontFamily: serif,
    fontSize: 40,
    lineHeight: 44,
    color: "#FFFFFF",
  },
  header: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.brand,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: serif,
    fontSize: 40,
    lineHeight: 44,
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary },
  emailBadge: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: `${colors.success}22`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  emailBadgeText: { fontSize: 12, color: colors.success, fontWeight: "600" },

  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface },
  cardShort: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2, marginBottom: 6 },
  cardAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardActionText: { fontSize: 13, fontWeight: "700" },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },
  tagOk: {
    backgroundColor: colors.success,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  tagOkText: { fontSize: 10, fontWeight: "800", color: colors.onBrand, letterSpacing: 0.5 },

  restoreBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  restoreText: { fontSize: 13, color: colors.onSurfaceSecondary, textDecorationLine: "underline" },
  footer: {
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface, flex: 1 },
  modalDesc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  modalPrice: { fontSize: 14, color: colors.onSurface },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  methods: { flexDirection: "row", gap: spacing.sm },
  methodBtn: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    minHeight: 72,
    justifyContent: "center",
  },
  methodBtnActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  methodLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurface, marginTop: 4 },
  methodSub: { fontSize: 9, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: 2 },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  errorText: { color: colors.error, fontSize: 13 },
  payBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  payBtnText: { color: colors.onBrand, fontSize: 15, fontWeight: "800" },
  modalHint: { fontSize: 11, color: colors.onSurfaceTertiary, textAlign: "center" },
});
