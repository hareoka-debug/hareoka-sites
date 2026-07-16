import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { storage } from "@/src/utils/storage";
import {
  PackageInfo,
  checkAccessDetailed,
  fetchPackages,
  getDeviceId,
  selectPackage,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

export default function SelectPackage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [pkgRes, deviceId] = await Promise.all([fetchPackages(), getDeviceId()]);
        setPackages(pkgRes.packages);
        // Si ya escogió → skip a mapa
        try {
          const access = await checkAccessDetailed(deviceId);
          const owned = access.owned_packages || [];
          setAlreadyOwned(owned);
          if (access.all_routes_unlocked || owned.length > 0) {
            router.replace("/map");
            return;
          }
        } catch {
          /* ignore */
        }
      } catch (e: any) {
        setError(e?.message || "No pudimos cargar los paquetes.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSelect = async (pkgId: string) => {
    setError(null);
    setSelecting(pkgId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const deviceId = await getDeviceId();
      const email = (await storage.getItem("rapa-nui-email", "")) as string;
      if (!email) {
        setError("Vuelve al inicio e ingresa tu email.");
        return;
      }
      await selectPackage(deviceId, email, pkgId);
      router.replace("/map");
    } catch (e: any) {
      setError(e?.message || "No pudimos guardar tu elección.");
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Escoge tu paquete de rutas</Text>
      <Text style={styles.sub}>
        Con tu compra tienes derecho a UN paquete de estas rutas. Después, si quieres explorar más,
        podrás desbloquear otros paquetes desde el mapa.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        {packages.map((pkg) => {
          const isOwned = alreadyOwned.includes(pkg.id);
          const isSelecting = selecting === pkg.id;
          return (
            <Pressable
              key={pkg.id}
              style={[styles.card, isOwned && styles.cardOwned]}
              onPress={() => !isOwned && !selecting && handleSelect(pkg.id)}
              disabled={isOwned || !!selecting}
              testID={`package-${pkg.id}`}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{pkg.emoji}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pkg.route_count} rutas</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{pkg.name}</Text>
              <Text style={styles.cardDesc}>{pkg.description}</Text>

              <View style={styles.routeList}>
                {pkg.routes.slice(0, 4).map((r) => (
                  <View key={r.id} style={styles.routeItem}>
                    <Feather name="map-pin" size={12} color={colors.onSurfaceTertiary} />
                    <Text style={styles.routeName} numberOfLines={1}>
                      {r.name}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.cardFooter}>
                {isOwned ? (
                  <View style={styles.ownedBadge}>
                    <Feather name="check" size={14} color={colors.success} />
                    <Text style={styles.ownedText}>Ya elegido</Text>
                  </View>
                ) : isSelecting ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <View style={styles.chooseBtn}>
                    <Text style={styles.chooseText}>Elegir este paquete</Text>
                    <Feather name="arrow-right" size={16} color={colors.onBrand} />
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.hintCard}>
        <Feather name="gift" size={14} color={colors.warning} />
        <Text style={styles.hintText}>
          ¿Quieres verlas todas? Después de elegir, desde el mapa puedes desbloquear otro paquete
          por $3.000 más, o desbloquear las 11 rutas de una vez por solo $5.000.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md },
  center: { justifyContent: "center", alignItems: "center" },
  title: { fontFamily: serif, fontSize: 26, color: colors.onSurface },
  sub: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceSecondary },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardOwned: { opacity: 0.6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emoji: { fontSize: 32 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceSecondary },
  cardTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface, marginTop: 4 },
  cardDesc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  routeList: { gap: 4, marginTop: spacing.sm },
  routeItem: { flexDirection: "row", gap: 6, alignItems: "center" },
  routeName: { fontSize: 12, color: colors.onSurfaceSecondary, flex: 1 },
  cardFooter: { marginTop: spacing.md, alignItems: "center" },
  chooseBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  chooseText: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
  ownedBadge: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  ownedText: { color: colors.success, fontSize: 13, fontWeight: "600" },
  hintCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
    marginTop: spacing.lg,
  },
  hintText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 17 },
});
