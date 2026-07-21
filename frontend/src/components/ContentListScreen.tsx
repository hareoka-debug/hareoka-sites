import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import React from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContentItem } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

// En web abrimos siempre en pestaña nueva para NO abandonar la app.
// En nativo usamos Linking normal.
function openExternal(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

type Props = {
  title: string;
  subtitle?: string;
  icon: any;
  color: string;
  loading: boolean;
  locked?: boolean;
  items: ContentItem[];
  emptyMsg?: string;
  onBack?: () => void;
  showDisclaimer?: boolean;
};

export function ContentListScreen({ title, subtitle, icon, color, loading, locked, items, emptyMsg, onBack, showDisclaimer }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // En web / entrada directa el historial puede no existir; siempre garantizamos volver al hub.
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      /* ignore */
    }
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn} testID="back">
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
          <Text style={styles.backBtnText}>Volver</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${color}22` }]}>
          <Feather name={icon} size={20} color={color} />
        </View>
      </View>

      {locked ? (
        <View style={styles.locked}>
          <View style={[styles.lockCircle, { backgroundColor: `${color}22` }]}>
            <Feather name="lock" size={32} color={color} />
          </View>
          <Text style={styles.lockTitle}>Contenido bloqueado</Text>
          <Text style={styles.lockDesc}>
            Necesitas comprar el acceso a esta sección desde la pantalla principal.
          </Text>
          <Pressable onPress={() => router.replace("/")} style={[styles.lockBtn, { backgroundColor: color }]}>
            <Text style={styles.lockBtnText}>Ir a la tienda</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={40} color={colors.onSurfaceTertiary} />
          <Text style={styles.empty}>{emptyMsg || "Aún no hay elementos aquí."}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + spacing.xxxl + 60,
              paddingTop: spacing.sm,
              gap: spacing.md,
            }}
          >
            {showDisclaimer ? (
              <View style={styles.disclaimer}>
                <Feather name="alert-circle" size={14} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.disclaimerText}>
                    Los comercios aquí listados son negocios independientes de la isla, sugeridos con fines informativos. No pertenecen ni están asociados a "Descubre Rapa Nui". Verifica precios, condiciones y disponibilidad directamente con cada uno.
                  </Text>
                  <Text style={styles.disclaimerTextEn}>
                    The businesses listed here are independent local businesses, suggested for informational purposes. They are not owned by or affiliated with "Descubre Rapa Nui". Confirm prices, conditions and availability directly with each one.
                  </Text>
                </View>
              </View>
            ) : null}
            {items.map((it) => (
              <ItemCard key={it.id} item={it} color={color} />
            ))}
          </ScrollView>
          {/* Botón flotante Volver — SIEMPRE visible aunque hagas scroll.
              En web mantenemos un buffer extra para evitar la barra de Safari iOS. */}
          <Pressable
            onPress={goBack}
            style={[
              styles.fabBack,
              { bottom: Math.max(insets.bottom, 0) + (Platform.OS === "web" ? 80 : spacing.lg) },
            ]}
            testID="back-fab"
          >
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
            <Text style={styles.fabBackText}>Volver / Back</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function ItemCard({ item, color }: { item: ContentItem; color: string }) {
  const call = () => {
    if (!item.phone) return;
    // En web, `tel:` funciona en móvil pero en desktop simplemente ignora; usamos ventana nueva por seguridad.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(`tel:${cleanPhone(item.phone)}`, "_self");
    } else {
      Linking.openURL(`tel:${cleanPhone(item.phone)}`).catch(() => {});
    }
  };
  const wsp = () => {
    if (!item.whatsapp) return;
    const num = cleanPhone(item.whatsapp).replace("+", "");
    openExternal(`https://wa.me/${num}`);
  };
  const web = () => item.website && openExternal(ensureHttp(item.website));

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardName}>{item.name}</Text>
        {item.category ? (
          <View style={[styles.tag, { backgroundColor: `${color}22` }]}>
            <Text style={[styles.tagText, { color }]}>{item.category}</Text>
          </View>
        ) : null}
      </View>
      {item.cuisine ? <Text style={styles.meta}>{item.cuisine}</Text> : null}
      {item.address ? (
        <View style={styles.metaRow}>
          <Feather name="map-pin" size={12} color={colors.onSurfaceTertiary} />
          <Text style={styles.meta}>{item.address}</Text>
        </View>
      ) : null}
      {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

      <View style={styles.actions}>
        {item.phone ? (
          <Pressable onPress={call} style={styles.actionBtn}>
            <Feather name="phone" size={14} color={colors.brand} />
            <Text style={styles.actionText}>{item.phone}</Text>
          </Pressable>
        ) : null}
        {item.whatsapp ? (
          <Pressable onPress={wsp} style={[styles.actionBtn, { borderColor: "#25D366" }]}>
            <Feather name="message-circle" size={14} color="#25D366" />
            <Text style={[styles.actionText, { color: "#25D366" }]}>WhatsApp</Text>
          </Pressable>
        ) : null}
        {item.website ? (
          <Pressable onPress={web} style={[styles.actionBtn, { borderColor: colors.info }]}>
            <Feather name="globe" size={14} color={colors.info} />
            <Text style={[styles.actionText, { color: colors.info }]}>Web</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function cleanPhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}
function ensureHttp(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: -4,
  },
  backBtnText: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  headerTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceTertiary },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  empty: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center" },

  locked: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  lockCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  lockTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  lockDesc: { fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 19 },
  lockBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  lockBtnText: { color: colors.onBrand, fontSize: 15, fontWeight: "700" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    gap: 6,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 12, color: colors.onSurfaceTertiary },
  desc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    minHeight: 36,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.brand },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#FFF7E6",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F4C77A",
    marginTop: spacing.sm,
  },
  disclaimerText: {
    fontSize: 12,
    color: "#7A4E00",
    lineHeight: 17,
  },
  disclaimerTextEn: {
    marginTop: 4,
    fontSize: 11,
    fontStyle: "italic",
    color: "#8B5A00",
    lineHeight: 15,
  },
  fabBack: {
    position: "absolute",
    left: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.xl,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brand,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  fabBackText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
