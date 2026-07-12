import { Feather, FontAwesome } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
  RouteData,
  WaterPoint,
  fetchRoute,
  fetchWaterPoints,
} from "@/src/lib/api";
import VaiBanner from "@/src/components/VaiBanner";
import { colors, difficultyColor, poiColor, poiIcon, radius, serif, spacing } from "@/src/lib/theme";
import { distanceKm } from "@/src/lib/geo";
import { shareGuideWhatsApp } from "@/src/lib/share";

// Formato de coordenada georreferenciada: -27.1258, -109.2768 → "27.1258° S · 109.2768° O"
const geoRef = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(4)}° S · ${Math.abs(lng).toFixed(4)}° O`;

export default function RouteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [waterPoints, setWaterPoints] = useState<WaterPoint[]>([]);
  const [error, setError] = useState(false);
  const [expandedPoi, setExpandedPoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [r, w] = await Promise.all([fetchRoute(id), fetchWaterPoints()]);
      setRoute(r);
      setWaterPoints(w);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No se pudo cargar la ruta.</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (!route) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const buyPoints = waterPoints.filter(
    (w) =>
      route.vai.buy_point_ids.includes(w.id) ||
      (w.custom && route.path.some(([la, ln]) => distanceKm(w.lat, w.lng, la, ln) <= 5)),
  );
  const hours = Math.floor(route.duration_min / 60);
  const mins = route.duration_min % 60;
  const duration = hours > 0 ? `${hours} h${mins ? ` ${mins} min` : ""}` : `${mins} min`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        <View style={styles.hero}>
          <Image source={{ uri: route.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(43,58,66,0.05)", "rgba(43,58,66,0.35)", "rgba(43,58,66,0.9)"]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={[styles.backBtn, { top: insets.top + spacing.sm }]}
            onPress={() => router.back()}
            hitSlop={12}
            testID="back-button"
          >
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable
            style={[styles.shareHeroBtn, { top: insets.top + spacing.sm }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              shareGuideWhatsApp();
            }}
            hitSlop={12}
            testID="share-button"
          >
            <FontAwesome name="whatsapp" size={20} color="#fff" />
          </Pressable>
          <View style={styles.heroContent}>
            <View style={[styles.typeTag, { backgroundColor: route.color }]}>
              <Text style={styles.typeTagText}>
                {route.type === "urbana" ? "RUTA URBANA" : "RUTA RURAL"}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{route.name}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Feather name="map" size={18} color={colors.brand} />
            <Text style={styles.infoValue}>{route.distance_km} km</Text>
            <Text style={styles.infoLabel}>Distancia</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Feather name="clock" size={18} color={colors.brand} />
            <Text style={styles.infoValue}>{duration}</Text>
            <Text style={styles.infoLabel}>Duración</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Feather name="trending-up" size={18} color={difficultyColor(route.difficulty)} />
            <Text style={[styles.infoValue, { color: difficultyColor(route.difficulty) }]}>
              {route.difficulty}
            </Text>
            <Text style={styles.infoLabel}>Dificultad</Text>
          </View>
        </View>

        <View style={[styles.section, { marginTop: spacing.lg }]}>
          <VaiBanner />
        </View>

        <View style={styles.section}>
          <Text style={styles.body}>{route.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Puntos de Interés</Text>
          {route.pois.map((p) => {
            const expanded = expandedPoi === p.name;
            return (
              <Pressable
                key={p.name}
                style={styles.poiCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPoi(expanded ? null : p.name);
                }}
                testID={`poi-${p.name}`}
              >
                <View style={styles.poiRow}>
                  {p.photo ? (
                    <Image source={{ uri: p.photo }} style={styles.poiThumb} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.poiIcon, { backgroundColor: poiColor(p.type) }]}>
                      <Feather name={poiIcon(p.type)} size={14} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poiName}>{p.name}</Text>
                    <View style={styles.geoRow}>
                      <Feather name="map-pin" size={10} color={colors.info} />
                      <Text style={styles.geoText}>{geoRef(p.lat, p.lng)}</Text>
                    </View>
                    <Text style={styles.poiDesc} numberOfLines={expanded ? undefined : 2}>
                      {p.description}
                    </Text>
                  </View>
                  <Feather
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.onSurfaceTertiary}
                  />
                </View>
                {expanded && p.photo ? (
                  <View style={styles.poiPhotoWrap}>
                    <Image source={{ uri: p.photo }} style={styles.poiPhoto} contentFit="cover" transition={300} />
                    <View style={styles.geoBadge}>
                      <Feather name="crosshair" size={11} color="#fff" />
                      <Text style={styles.geoBadgeText}>Foto real · {geoRef(p.lat, p.lng)}</Text>
                    </View>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.vaiCard}>
            <View style={styles.vaiHeader}>
              <View style={styles.vaiDrop}>
                <Feather name="droplet" size={18} color={colors.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vaiTitle}>Puntos Vai & Hidratación</Text>
                <Text style={styles.vaiSub}>«Vai» significa agua en rapanui</Text>
              </View>
            </View>

            <View style={styles.litersRow}>
              <Text style={styles.litersLabel}>Agua recomendada:</Text>
              <Text style={styles.litersValue}>{route.vai.recommended_liters}</Text>
            </View>

            <Text style={styles.vaiSectionLabel}>Dónde comprar agua VAINATIVA</Text>
            {buyPoints.map((w) => (
              <View key={w.id} style={styles.buyRow}>
                <Feather name="shopping-bag" size={14} color={colors.onBrandTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.buyName}>{w.name}</Text>
                  <Text style={styles.buyDesc}>{w.description}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.vaiSectionLabel}>Consejos de hidratación</Text>
            {route.vai.tips.map((t, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBullet}>•</Text>
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.navigate({ pathname: "/map", params: { selected: route.id } });
          }}
          testID="view-on-map"
        >
          <Feather name="map-pin" size={16} color={colors.onBrand} />
          <Text style={styles.ctaText}>Ver en el Mapa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  errorText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: colors.onBrand, fontWeight: "600" },
  hero: { height: 320, justifyContent: "flex-end" },
  backBtn: {
    position: "absolute",
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  shareHeroBtn: {
    position: "absolute",
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  typeTag: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  typeTagText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  heroTitle: {
    fontFamily: serif,
    fontSize: 30,
    lineHeight: 36,
    color: colors.onSurfaceInverse,
  },
  infoRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  infoItem: { flex: 1, alignItems: "center", gap: 4 },
  infoDivider: { width: 1, backgroundColor: colors.border },
  infoValue: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  infoLabel: { fontSize: 11, color: colors.onSurfaceTertiary },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionTitle: {
    fontFamily: serif,
    fontSize: 22,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  body: { fontSize: 15, lineHeight: 24, color: colors.onSurfaceSecondary },
  poiCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  poiRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  poiThumb: { width: 62, height: 62, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  poiIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  poiName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  geoRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  geoText: { fontSize: 11, color: colors.info, fontWeight: "600" },
  poiDesc: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceTertiary, marginTop: 2 },
  poiPhotoWrap: { marginTop: spacing.md, borderRadius: radius.md, overflow: "hidden" },
  poiPhoto: { width: "100%", height: 190 },
  geoBadge: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(18,34,43,0.75)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  geoBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  vaiCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  vaiHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  vaiDrop: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  vaiTitle: { fontFamily: serif, fontSize: 19, color: colors.onBrandTertiary },
  vaiSub: { fontSize: 12, color: colors.onSurfaceTertiary, fontStyle: "italic" },
  litersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  litersLabel: { fontSize: 13, color: colors.onSurfaceSecondary },
  litersValue: { fontSize: 14, fontWeight: "700", color: colors.onBrandTertiary },
  vaiSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.onBrandTertiary,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  buyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.xs },
  buyName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  buyDesc: { fontSize: 12, lineHeight: 18, color: colors.onSurfaceSecondary },
  tipRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  tipBullet: { color: colors.onBrandTertiary, fontSize: 14 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceSecondary },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 52,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
});
