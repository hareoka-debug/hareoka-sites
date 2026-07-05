import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import IslandMap from "@/src/components/IslandMap";
import {
  RouteData,
  WaterPoint,
  checkAccess,
  fetchRoutes,
  fetchWaterPoints,
  getDeviceId,
  getLocalPaid,
  setLocalPaid,
} from "@/src/lib/api";
import { colors, difficultyColor, radius, serif, spacing } from "@/src/lib/theme";

type Filter = "todas" | "urbana" | "rural";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "urbana", label: "Urbanas" },
  { key: "rural", label: "Rurales" },
];

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ selected?: string }>();
  const sheetRef = useRef<BottomSheet>(null);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [waterPoints, setWaterPoints] = useState<WaterPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(
    params.selected || null,
  );

  const snapPoints = useMemo(() => ["16%", "45%", "85%"], []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Guardia de acceso: si no pagó, volver al paywall
      const paid = await getLocalPaid();
      if (!paid) {
        const deviceId = await getDeviceId();
        const hasAccess = await checkAccess(deviceId);
        if (!hasAccess) {
          router.replace("/");
          return;
        }
        await setLocalPaid();
      }
      const [r, w] = await Promise.all([fetchRoutes(), fetchWaterPoints()]);
      setRoutes(r);
      setWaterPoints(w);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params.selected) setSelectedRouteId(params.selected);
  }, [params.selected]);

  const filtered = useMemo(
    () => (filter === "todas" ? routes : routes.filter((r) => r.type === filter)),
    [routes, filter],
  );

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const onSelectRoute = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRouteId(id);
    sheetRef.current?.snapToIndex(0);
  };

  const renderCard = ({ item }: { item: RouteData }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/route/${item.id}`);
      }}
      testID={`route-card-${item.id}`}
    >
      <Image source={{ uri: item.image }} style={styles.cardImage} contentFit="cover" />
      <View style={styles.cardBody}>
        <View style={styles.cardTags}>
          <View style={[styles.tag, { backgroundColor: colors.brandTertiary }]}>
            <Text style={[styles.tagText, { color: colors.onBrandTertiary }]}>
              {item.type === "urbana" ? "Urbana" : "Rural"}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.surfaceTertiary }]}>
            <Text style={[styles.tagText, { color: difficultyColor(item.difficulty) }]}>
              {item.difficulty}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.cardMeta}>
          <Feather name="map" size={12} color={colors.onSurfaceTertiary} />
          <Text style={styles.metaText}>{item.distance_km} km</Text>
          <Feather name="clock" size={12} color={colors.onSurfaceTertiary} />
          <Text style={styles.metaText}>
            {Math.floor(item.duration_min / 60) > 0
              ? `${Math.floor(item.duration_min / 60)} h ${item.duration_min % 60 || ""}${item.duration_min % 60 ? " min" : ""}`
              : `${item.duration_min} min`}
          </Text>
        </View>
      </View>
      <Pressable
        hitSlop={8}
        style={styles.pinBtn}
        onPress={() => onSelectRoute(item.id)}
        testID={`route-pin-${item.id}`}
      >
        <Feather name="map-pin" size={18} color={colors.brand} />
      </Pressable>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No se pudieron cargar las rutas.</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <IslandMap
        routes={routes}
        waterPoints={waterPoints}
        selectedRouteId={selectedRouteId}
        onSelectRoute={onSelectRoute}
      />

      <View style={[styles.header, { top: insets.top + spacing.md }]}>
        <View style={styles.headerChip}>
          <Text style={styles.headerTitle}>Rutas Rapa Nui</Text>
          <Text style={styles.headerSub}>{routes.length} rutas · Isla de Pascua</Text>
        </View>
      </View>

      {selectedRoute ? (
        <Pressable
          style={[styles.selectedBanner, { top: insets.top + spacing.md + 64 }]}
          onPress={() => router.push(`/route/${selectedRoute.id}`)}
          testID="selected-route-banner"
        >
          <View style={[styles.dot, { backgroundColor: selectedRoute.color }]} />
          <Text style={styles.selectedName} numberOfLines={1}>
            {selectedRoute.name}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.brand} />
        </Pressable>
      ) : null}

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      >
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilter(f.key);
                }}
                testID={`filter-${f.key}`}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item: RouteData) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.lg }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No hay rutas para este filtro.</Text>
          }
        />
      </BottomSheet>
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
  header: { position: "absolute", left: spacing.lg, right: spacing.lg },
  headerChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  headerTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  selectedBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  selectedName: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.onSurface },
  sheetBg: { backgroundColor: colors.surface, borderRadius: radius.lg },
  filters: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "500" },
  pillTextActive: { color: colors.onBrand },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: "hidden",
    alignItems: "center",
  },
  cardImage: { width: 84, height: 92 },
  cardBody: { flex: 1, padding: spacing.md, gap: 4 },
  cardTags: { flexDirection: "row", gap: spacing.xs },
  tag: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: "700" },
  cardTitle: { fontFamily: serif, fontSize: 16, color: colors.onSurface },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { fontSize: 12, color: colors.onSurfaceTertiary, marginRight: spacing.sm },
  pinBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  emptyText: {
    textAlign: "center",
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xl,
    fontSize: 14,
  },
});
