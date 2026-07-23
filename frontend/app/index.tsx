import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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
  claimTransaction,
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

// Imagen de banner por producto (se muestra encima de cada tarjeta).
const PRODUCT_IMAGE: Record<string, string> = {
  "routes-3":
    "https://images.unsplash.com/photo-1774343420644-3653b409d609?crop=entropy&cs=srgb&fm=jpg&q=85",
  "routes-all":
    "https://images.unsplash.com/photo-1579665063783-77579f0a38a3?crop=entropy&cs=srgb&fm=jpg&q=85",
  agencies:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Playa_Anakena_-_panoramio.jpg/960px-Playa_Anakena_-_panoramio.jpg",
  restaurants:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?crop=entropy&cs=srgb&fm=jpg&q=85",
  rentcars:
    "https://images.unsplash.com/photo-1577739156682-d3a82b8dea28?crop=entropy&cs=srgb&fm=jpg&q=85",
  song:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Wild_Horses_of_Easter_Island.jpg/960px-Wild_Horses_of_Easter_Island.jpg",
  emergencies:
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?crop=entropy&cs=srgb&fm=jpg&q=85",
};

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

  // Animación pulsante para destacar "Las 11 Rutas Completas"
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    shadowOpacity: 0.15 + (pulse.value - 1) * 6,
  }));

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
            // Auto-reclamo por tx: vincula el pago a este dispositivo
            // aunque el navegador haya cambiado tras Flow/Stripe/MP.
            try {
              const claimed = await claimTransaction(pending, dev);
              if (claimed?.email) {
                await storage.setItem("rapa-nui-email", claimed.email);
              }
            } catch {
              /* ignore */
            }
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
            <Text style={styles.heroEyebrow}>GUÍA DE ISLA DE PASCUA · EASTER ISLAND GUIDE</Text>
            <Text style={styles.heroTitle}>Descubre{"\n"}Rapa Nui</Text>
            <Text style={styles.heroTitleEn}>Discover Rapa Nui</Text>
            <Text style={styles.heroTagline}>
              Elige el contenido que quieres desbloquear y vive la experiencia
            </Text>
            <Text style={styles.heroTaglineEn}>
              Choose what you want to unlock and live the experience
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
        {/* Encabezado */}
        <View style={styles.header}>
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
          const isHighlighted = p.id === "routes-all";
          const isRestaurants = p.id === "restaurants";

          const CardWrapper: any = isHighlighted ? Animated.View : View;
          const wrapperExtraStyle: any = isHighlighted
            ? [pulseStyle, styles.highlightedCardOuter]
            : undefined;

          return (
            <CardWrapper key={p.id} style={wrapperExtraStyle}>
              {isHighlighted ? (
                <View style={styles.hotBadge}>
                  <Feather name="star" size={11} color="#FFFFFF" />
                  <Text style={styles.hotBadgeText}>MÁS COMPLETO · BEST VALUE</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => openProduct(p)}
                style={({ pressed }) => [
                  styles.card,
                  isHighlighted && styles.cardHighlighted,
                  pressed && { opacity: 0.9 },
                ]}
                testID={`product-${p.id}`}
              >
                <Image
                  source={{ uri: PRODUCT_IMAGE[p.id] }}
                  style={styles.cardImage}
                  contentFit="cover"
                />
                <View style={styles.cardImageOverlay} />
                <View style={styles.cardImageBadges}>
                  <View style={[styles.cardIconMini, { backgroundColor: p.color }]}>
                    <Feather name={PRODUCT_ICON[p.id] || "box"} size={16} color="#FFFFFF" />
                  </View>
                  {owned ? (
                    <View style={[styles.tag, styles.tagOk]}>
                      <Feather name="unlock" size={11} color={colors.onBrand} />
                      <Text style={styles.tagOkText}>ACTIVO</Text>
                    </View>
                  ) : !isFree ? (
                    <View style={[styles.tag, styles.tagPrice]}>
                      <Text style={styles.tagPriceText}>
                        ${p.amount_clp.toLocaleString("es-CL")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {p.name_en ? (
                    <Text style={styles.cardNameEn} numberOfLines={2}>
                      {p.name_en}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.cardShort,
                      isRestaurants && styles.cardShortHighlight,
                    ]}
                    numberOfLines={2}
                  >
                    {p.short}
                    {p.short_en ? `  ·  ${p.short_en}` : ""}
                  </Text>
                  <View style={styles.cardAction}>
                    <Text style={[styles.cardActionText, { color: p.color }]}>
                      {owned || isFree ? "Ver contenido · View" : "Comprar acceso · Buy"}
                    </Text>
                    <Feather name="chevron-right" size={16} color={p.color} />
                  </View>
                </View>
              </Pressable>
            </CardWrapper>
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
          <Text style={styles.restoreText}>
            ¿Ya pagaste antes? Restaurar acceso con tu email
          </Text>
        </Pressable>
        <Text style={styles.restoreTextEn}>
          Already paid? Restore access with your email
        </Text>

        <Text style={styles.footer}>
          Pago único por dispositivo · Pago seguro · Sin suscripciones
        </Text>
        <Text style={styles.footerEn}>
          One-time payment per device · Secure payment · No subscriptions
        </Text>

        <Pressable
          onPress={() => router.push("/admin")}
          style={styles.adminLink}
          testID="admin-link"
        >
          <Text style={styles.adminLinkText}>© Todos los derechos reservados · All rights reserved</Text>
        </Pressable>
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
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setBuying(null)}
          />
          <View style={styles.modalBox}>
            {/* Botón flotante SIEMPRE visible */}
            <Pressable
              onPress={() => setBuying(null)}
              hitSlop={16}
              style={styles.modalFloatingClose}
              testID="close-buy"
            >
              <Feather name="chevron-down" size={22} color={colors.onSurface} />
            </Pressable>
            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{buying?.name}</Text>
              </View>
              <Text style={styles.modalDesc}>{buying?.description}</Text>
              {buying?.description_en ? (
                <Text style={styles.modalDescEn}>{buying.description_en}</Text>
              ) : null}
              <Text style={styles.modalPrice}>
                Precio · Price:{" "}
                <Text style={{ fontWeight: "800" }}>
                  ${buying?.amount_clp.toLocaleString("es-CL")} CLP
                </Text>
              </Text>

              <Text style={styles.label}>Elige medio de pago · Choose payment</Text>
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

              <Text style={styles.label}>Tu email (para respaldar tu compra) · Your email</Text>
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
                    Pagar · Pay ${buying?.amount_clp.toLocaleString("es-CL")} CLP
                  </Text>
                )}
              </Pressable>
              <Text style={styles.modalHint}>
                Se abrirá la página segura de {METHODS.find((x) => x.key === buyMethod)?.label}. Al volver, tu acceso queda activo.
                {"\n"}
                <Text style={{ fontStyle: "italic" }}>
                  You will be redirected to {METHODS.find((x) => x.key === buyMethod)?.label}. When you return, your access is active.
                </Text>
              </Text>

              {/* Botón de volver secundario dentro del modal */}
              <Pressable
                onPress={() => setBuying(null)}
                style={styles.modalCancel}
                testID="cancel-buy"
              >
                <Feather name="arrow-left" size={16} color={colors.onSurfaceSecondary} />
                <Text style={styles.modalCancelText}>Volver · Back</Text>
              </Pressable>
            </ScrollView>
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
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowRestore(false)}
          />
          <View style={styles.modalBox}>
            <Pressable
              onPress={() => setShowRestore(false)}
              hitSlop={16}
              style={styles.modalFloatingClose}
              testID="close-restore"
            >
              <Feather name="chevron-down" size={22} color={colors.onSurface} />
            </Pressable>
            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Restaurar acceso · Restore access</Text>
              </View>
              <Text style={styles.modalDesc}>
                Ingresa el email con el que pagaste. Renovamos tu sesión por 30 días en este dispositivo.
              </Text>
              <Text style={styles.modalDescEn}>
                Enter the email you paid with. We renew your session for 30 days on this device.
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
                  <Text style={styles.payBtnText}>Verificar y entrar · Verify & enter</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowRestore(false)}
                style={styles.modalCancel}
                testID="cancel-restore"
              >
                <Feather name="arrow-left" size={16} color={colors.onSurfaceSecondary} />
                <Text style={styles.modalCancelText}>Volver · Back</Text>
              </Pressable>
            </ScrollView>
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
  heroTitleEn: {
    fontFamily: serif,
    fontStyle: "italic",
    fontSize: 18,
    color: "#FFD9B8",
    marginTop: 2,
  },
  heroTagline: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    color: "#F9F8F6",
    fontWeight: "500",
    maxWidth: 340,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
  heroTaglineEn: {
    marginTop: 4,
    fontSize: 12,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.85)",
    maxWidth: 340,
  },
  header: { marginBottom: spacing.md },
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
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 140,
  },
  cardImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  cardImageBadges: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardIconMini: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: spacing.md, gap: 4 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardName: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  cardNameEn: {
    fontSize: 13,
    fontStyle: "italic",
    color: colors.onSurfaceSecondary,
    marginTop: 1,
  },
  cardShort: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2, marginBottom: 6 },
  cardShortHighlight: {
    fontSize: 14,
    color: "#E63946",
    fontWeight: "800",
    fontStyle: "italic",
  },
  highlightedCardOuter: {
    marginBottom: spacing.lg,
    shadowColor: "#8B3A2E",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    elevation: 8,
  },
  cardHighlighted: {
    borderWidth: 2.5,
    borderColor: "#8B3A2E",
    marginBottom: 0,
  },
  hotBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#8B3A2E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    marginLeft: spacing.sm,
    zIndex: 2,
    transform: [{ translateY: 8 }],
  },
  hotBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  cardAction: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardActionText: { fontSize: 14, fontWeight: "700" },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },
  tagPrice: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  tagPriceText: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
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
  restoreTextEn: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 11,
    fontStyle: "italic",
    color: colors.onSurfaceTertiary,
  },
  footer: {
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  footerEn: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 10,
    fontStyle: "italic",
    color: colors.onSurfaceTertiary,
  },
  adminLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    opacity: 0.7,
  },
  adminLinkText: { fontSize: 11, color: colors.onSurfaceTertiary, textDecorationLine: "underline" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingTop: spacing.xxl + 8,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    maxHeight: "88%",
  },
  modalFloatingClose: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    left: "50%",
    marginLeft: -22,
    width: 44,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalCancel: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  modalCancelText: {
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface, flex: 1 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDesc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  modalDescEn: {
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    fontStyle: "italic",
    lineHeight: 17,
  },
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
