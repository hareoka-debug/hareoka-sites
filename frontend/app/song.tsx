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

import { Song, checkUnlocked, fetchSong, getDeviceId, getLocalUnlocked } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

export default function SongScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      let unlocked: string[] = [];
      try { unlocked = await checkUnlocked(deviceId); } catch { unlocked = await getLocalUnlocked(); }
      if (!unlocked.includes("song")) { setLocked(true); return; }
      const s = await fetchSong();
      setSong(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openSpotify = () => song && Linking.openURL(song.spotify_url);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (locked) return (
    <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
      <Feather name="lock" size={40} color={colors.brand} />
      <Text style={styles.title}>Contenido bloqueado</Text>
      <Pressable style={styles.cta} onPress={() => router.replace("/")}><Text style={styles.ctaText}>Volver al inicio</Text></Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={styles.hbtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
          <Text style={styles.hbtnText}>Volver</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Canción Rapa Nui</Text>
          <Text style={styles.headerSub}>Exclusive Rapa Nui song</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.card}>
          <View style={styles.iconBubble}><Feather name="music" size={26} color="#FFF" /></View>
          <Text style={styles.title}>{song?.title}</Text>
          {song?.artist && <Text style={styles.artist}>{song.artist}</Text>}
          {song?.description && <Text style={styles.desc}>{song.description}</Text>}
          <Pressable style={styles.cta} onPress={openSpotify}>
            <Feather name="play-circle" size={20} color="#FFF" />
            <Text style={styles.ctaText}>Escuchar en Spotify · Listen on Spotify</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  hbtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  hbtnText: { fontSize: 14, color: colors.onSurface },
  headerTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceTertiary, fontStyle: "italic" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  iconBubble: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: serif, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  artist: { fontSize: 14, color: colors.onSurfaceSecondary },
  desc: { fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  cta: { flexDirection: "row", gap: 8, backgroundColor: "#1DB954", borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
