import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContentItem, checkUnlocked, fetchContent, getDeviceId, getLocalUnlocked } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

interface Config {
  collection: string;
  productId: string; // producto que desbloquea la pantalla
  titleEs: string;
  titleEn: string;
  subtitle?: string;
  requiresPayment: boolean;
  showCategory?: boolean;
}

export function ContentListScreen({ config }: { config: Config }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (config.requiresPayment) {
        const deviceId = await getDeviceId();
        let unlocked: string[] = [];
        try {
          unlocked = await checkUnlocked(deviceId);
        } catch {
          unlocked = await getLocalUnlocked();
        }
        if (!unlocked.includes(config.productId)) {
          setLocked(true);
          setLoading(false);
          return;
        }
      }
      const list = await fetchContent(config.collection);
      setItems(list);
    } catch (e) {
      // dejar vacío
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const openTel = (phone: string) => {
    const clean = phone.replace(/\s+/g, "");
    if (Platform.OS === "web") window.location.href = `tel:${clean}`;
    else Linking.openURL(`tel:${clean}`);
  };
  const openWhats = (phone: string) => {
    const clean = phone.replace(/[^\d]/g, "");
    Linking.openURL(`https://wa.me/${clean}`);
  };
  const openWeb = (url: string) => Linking.openURL(url);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
        <Feather name="lock" size={40} color={colors.brand} />
        <Text style={styles.lockedTitle}>Contenido bloqueado</Text>
        <Text style={styles.lockedText}>Desbloquea este contenido desde el paywall principal.</Text>
        <Pressable style={styles.backCta} onPress={() => router.replace("/")}>
          <Text style={styles.backCtaText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
          <Text style={styles.headerBackText}>Volver</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{config.titleEs}</Text>
          <Text style={styles.headerSub}>{config.titleEn}{config.subtitle ? ` · ${config.subtitle}` : ""}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
        {items.length === 0 && (
          <Text style={styles.empty}>Aún no hay elementos registrados.</Text>
        )}
        {items.map((it) => (
          <View key={it.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.name}>{it.name}</Text>
              {(it.category || it.cuisine) && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{it.category || it.cuisine}</Text>
                </View>
              )}
            </View>
            {it.description && <Text style={styles.desc}>{it.description}</Text>}
            {it.address && (
              <Text style={styles.meta}><Feather name="map-pin" size={12} color={colors.onSurfaceTertiary} /> {it.address}</Text>
            )}
            <View style={styles.actions}>
              {it.phone && (
                <Pressable style={styles.actionBtn} onPress={() => openTel(it.phone!)}>
                  <Feather name="phone" size={13} color={colors.brand} />
                  <Text style={styles.actionText}>{it.phone}</Text>
                </Pressable>
              )}
              {it.whatsapp && (
                <Pressable style={styles.actionBtn} onPress={() => openWhats(it.whatsapp!)}>
                  <Feather name="message-circle" size={13} color="#25D366" />
                  <Text style={[styles.actionText, { color: "#25D366" }]}>WhatsApp</Text>
                </Pressable>
              )}
              {it.website && (
                <Pressable style={styles.actionBtn} onPress={() => openWeb(it.website!)}>
                  <Feather name="globe" size={13} color={colors.onSurfaceSecondary} />
                  <Text style={styles.actionText}>Web</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  lockedTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  lockedText: { fontSize: 14, color: colors.onSurfaceSecondary, textAlign: "center" },
  backCta: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 12 },
  backCtaText: { color: "#FFF", fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  headerBackText: { fontSize: 14, color: colors.onSurface },
  headerTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceTertiary, fontStyle: "italic" },
  empty: { textAlign: "center", color: colors.onSurfaceTertiary, marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface, flex: 1 },
  tag: { backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 11, color: colors.brand, fontWeight: "700" },
  desc: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
  meta: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
  actionText: { fontSize: 12, color: colors.brand, fontWeight: "600" },
});
