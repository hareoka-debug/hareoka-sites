import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import IslandMap from "@/src/components/IslandMap";
import { useUserLocation } from "@/src/hooks/use-user-location";
import {
  RouteData,
  WaterPoint,
  checkAccessDetailed,
  fetchRoutes,
  fetchWaterPoints,
  getDeviceId,
} from "@/src/lib/api";
import { colors, difficultyColor, radius, serif, spacing } from "@/src/lib/theme";
import { distanceKm, formatDistance } from "@/src/lib/geo";
import { shareGuideWhatsApp } from "@/src/lib/share";

// Product → lista de rutas permitidas. Coincide con backend PRODUCTS.
const ROUTES_3 = [
  "circuito-hanga-roa",
  "costanera-policarpo-toro",
  "ana-kai-tangata",
];

const ON_ISLAND = (lat: number, lng: number) =>
  lat <= -27.02 && lat >= -27.22 && lng >= -109.49 && lng <= -109.2;

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
  const [ownedProducts, setOwnedProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(
    params.selected || null,
  );
  const { coords, tracking, acquiring, start, stop } = useUserLocation();
  const [locNote, setLocNote] = useState<string | null>(null);

  const snapPoints = useMemo(() => ["12%", "38%", "85%"], []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const deviceId = await getDeviceId();
      const acc = await checkAccessDetailed(deviceId).catch(() => null);
      const owned = acc?.owned_products || [];
      // Necesita al menos un producto de rutas
      const hasRoutes = owned.includes("routes-3") || owned.includes("routes-all");
      if (!hasRoutes) {
        router.replace("/");
        return;
      }
      setOwnedProducts(owned);
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

  const hasAll = ownedProducts.includes("routes-all");
  const allowedRouteIds = useMemo(() => {
    if (hasAll) return null; // null = todas permitidas
    return new Set(ROUTES_3);
  }, [hasAll]);

  const filtered = useMemo(() => {
    const byPackage = allowedRouteIds
      ? routes.filter((r) => allowedRouteIds.has(r.id))
      : routes;
    return filter === "todas" ? byPackage : byPackage.filter((r) => r.type === filter);
  }, [routes, filter, allowedRouteIds]);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const onSelectRoute = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRouteId(id);
    sheetRef.current?.snapToIndex(0);
  };

  useEffect(() => {
    if (coords && !ON_ISLAND(coords.lat, coords.lng)) {
      setLocNote(
        Platform.OS === "web"
          ? "Estás fuera de Rapa Nui: tu posición no aparece en el mapa de la isla."
          : "Estás fuera de Rapa Nui.",
      );
    } else if (coords) {
      setLocNote(null);
    }
  }, [coords]);

  const beginTracking = useCallback(async () => {
    const result = await start();
    if (result === "ok") return;
    if (result === "blocked") {
      if (Platform.OS === "web") {
        setLocNote("La ubicación está bloqueada en tu navegador. Actívala en la configuración del sitio.");
      } else {
        Alert.alert(
          "Permiso de ubicación necesario",
          "Para seguir las rutas en tiempo real, activa la ubicación de esta app en Ajustes.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } else if (result === "denied") {
      setLocNote("Sin permiso de ubicación no podemos mostrar tu posición en el mapa.");
    } else {
      setLocNote("No se pudo obtener tu ubicación. Intenta de nuevo.");
    }
  }, [start]);

  const handleLocate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocNote(null);
    if (tracking) {
      stop();
      return;
    }
    if (Platform.OS !== "web") {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Tu ubicación en el mapa",
          "Mostraremos tu posición sobre las rutas para que puedas seguirlas en tiempo real.",
          [
            { text: "Ahora no", style: "cancel" },
            { text: "Continuar", onPress: beginTracking },
          ],
        );
        return;
      }
    }
    beginTracking();
  };

  const renderCard = ({ item }: { item: RouteData }) => {
    const dist = coords
      ? distanceKm(coords.lat, coords.lng, item.path[0][0], item.path[0][1])
      : null;
    return (
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
          {dist !== null ? (
            <View style={styles.cardMeta}>
              <Feather name="navigation" size={12} color={colors.info} />
              <Text style={styles.distText}>Inicio {formatDistance(dist)}</Text>
            </View>
          ) : null}
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
  };

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
        routes={filtered}
        waterPoints={waterPoints}
        selectedRouteId={selectedRouteId}
        onSelectRoute={onSelectRoute}
        userLocation={coords}
      />

      <View style={[styles.header, { top: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => router.replace("/")}
          style={styles.homeBtn}
          testID="back-home"
        >
          <Feather name="home" size={18} color={colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.headerChip}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/admin");
          }}
          delayLongPress={800}
          testID="header-chip"
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            Rutas Rapa Nui
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {filtered.length}{hasAll ? "" : `/${routes.length}`} rutas
          </Text>
        </Pressable>
        {!hasAll && (
          <Pressable
            style={styles.unlockBtn}
            onPress={() => router.replace("/")}
            testID="unlock-more"
          >
            <Feather name="unlock" size={13} color={colors.onBrand} />
            <Text style={styles.unlockText}>+11</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.shareBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            shareGuideWhatsApp();
          }}
          testID="share-button"
        >
          <FontAwesome name="whatsapp" size={20} color="#fff" />
        </Pressable>
      </View>

      <Pressable
        style={[
          styles.locateFab,
          { top: insets.top + spacing.md + 56 },
          tracking && styles.locateFabActive,
        ]}
        onPress={handleLocate}
        disabled={acquiring}
        testID="locate-button"
      >
        {acquiring ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Feather name="navigation" size={20} color={tracking ? colors.onBrand : colors.brand} />
        )}
      </Pressable>

      {locNote ? (
        <Pressable
          style={[styles.locNote, { top: insets.top + spacing.md + 56 }]}
          onPress={() => setLocNote(null)}
        >
          <Feather name="info" size={14} color={colors.onSurfaceSecondary} />
          <Text style={styles.locNoteText}>{locNote}</Text>
        </Pressable>
      ) : null}

      {selectedRoute ? (
        <Pressable
          style={[styles.selectedBanner, { top: insets.top + spacing.md + 56 }]}
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
        index={selectedRouteId ? 0 : 1}
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
  header: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1DA851",
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
  },
  unlockText: { color: colors.onBrand, fontSize: 12, fontWeight: "800" },
  headerChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: "center",
  },
  headerTitle: { fontFamily: serif, fontSize: 16, color: colors.onSurface },
  headerSub: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 1 },
  locateFab: {
    position: "absolute",
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  locateFabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  locNote: {
    position: "absolute",
    right: spacing.lg,
    left: spacing.lg + 60,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locNoteText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 17 },
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
  distText: { fontSize: 12, color: colors.info, fontWeight: "600" },
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
