import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ContentItem,
  checkUnlocked,
  fetchSongs,
  getDeviceId,
  getLocalUnlocked,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const HERO = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Wild_Horses_of_Easter_Island.jpg/960px-Wild_Horses_of_Easter_Island.jpg";

export default function SongScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [songs, setSongs] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      let unlocked: string[] = [];
      try { unlocked = await checkUnlocked(deviceId); } catch { unlocked = await getLocalUnlocked(); }
      if (!unlocked.includes("song")) { setLocked(true); return; }
      const list = await fetchSongs();
      setSongs(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openSpotify = (url?: string) => url && Linking.openURL(url);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (locked) return (
    <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
      <Feather name="lock" size={40} color={colors.brand} />
      <Text style={styles.title}>Contenido bloqueado</Text>
      <Pressable style={styles.cta} onPress={() => router.replace("/")}>
        <Text style={styles.ctaText}>Volver al inicio</Text>
      </Pressable>
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
          <Text style={styles.headerTitle}>Música Rapa Nui</Text>
          <Text style={styles.headerSub}>Exclusive Rapanui music</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: HERO }} style={styles.heroImg} />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>Escucha y descubre la emoción que expresa el pasado</Text>
            <Text style={styles.heroTitleEn}>Listen and discover the emotion the past expresses</Text>
          </View>
        </View>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {songs.length === 0 && (
            <Text style={styles.empty}>Aún no hay canciones registradas. El dueño puede agregar canciones desde el panel del admin.</Text>
          )}
          {songs.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.iconBubble}><Feather name="music" size={22} color="#FFF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.songTitle}>{s.name}</Text>
                {s.artist && <Text style={styles.songArtist}>{s.artist}</Text>}
                {s.description && <Text style={styles.songDesc}>{s.description}</Text>}
                {s.spotify_url && (
                  <Pressable style={styles.cta} onPress={() => openSpotify(s.spotify_url)}>
                    <Feather name="play-circle" size={18} color="#FFF" />
                    <Text style={styles.ctaText}>Escuchar en Spotify · Listen on Spotify</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
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
  heroWrap: { height: 200, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: spacing.lg },
  heroTitle: { fontFamily: serif, fontSize: 18, color: "#FFF" },
  heroTitleEn: { fontStyle: "italic", fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  empty: { textAlign: "center", color: colors.onSurfaceTertiary, fontStyle: "italic", marginTop: spacing.xl },
  card: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  iconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center" },
  songTitle: { fontFamily: serif, fontSize: 17, color: colors.onSurface },
  songArtist: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  songDesc: { fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 18, marginTop: 6 },
  title: { fontFamily: serif, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  cta: { flexDirection: "row", gap: 8, backgroundColor: "#1DB954", borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: spacing.md, alignSelf: "flex-start" },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});
