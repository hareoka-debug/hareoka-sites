import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SongConfig, checkAccessDetailed, fetchSong, getDeviceId } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const COLOR = "#1DB954";

export default function SongScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [song, setSong] = useState<SongConfig | null>(null);
  const [locked, setLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancel = false;
      (async () => {
        setLoading(true);
        try {
          const dev = await getDeviceId();
          const acc = await checkAccessDetailed(dev);
          if (!acc.owned_products.includes("song")) {
            if (!cancel) setLocked(true);
            return;
          }
          const s = await fetchSong();
          if (!cancel) setSong(s);
        } catch (e) {
          console.warn(e);
        } finally {
          if (!cancel) setLoading(false);
        }
      })();
      return () => {
        cancel = true;
      };
    }, []),
  );

  const openSpotify = () => {
    if (song?.spotify_url) Linking.openURL(song.spotify_url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => {
            try {
              if (router.canGoBack()) {
                router.back();
                return;
              }
            } catch {
              /* ignore */
            }
            router.replace("/");
          }}
          hitSlop={12}
          style={styles.backBtn}
          testID="song-back"
        >
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
          <Text style={styles.backBtnText}>Volver</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Canción Rapa Nui</Text>
          <Text style={styles.headerSub}>Música tradicional</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${COLOR}22` }]}>
          <Feather name="music" size={20} color={COLOR} />
        </View>
      </View>

      {locked ? (
        <View style={styles.center}>
          <View style={[styles.lockCircle, { backgroundColor: `${COLOR}22` }]}>
            <Feather name="lock" size={32} color={COLOR} />
          </View>
          <Text style={styles.lockTitle}>Contenido bloqueado</Text>
          <Text style={styles.lockDesc}>
            Compra el acceso a esta canción desde la pantalla principal.
          </Text>
          <Pressable onPress={() => router.replace("/")} style={[styles.actionBtn, { backgroundColor: COLOR }]}>
            <Text style={styles.actionText}>Ir a la tienda</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLOR} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: `${COLOR}22` }]}>
              <Feather name="music" size={40} color={COLOR} />
            </View>
            <Text style={styles.songTitle}>{song?.title}</Text>
            {song?.artist ? <Text style={styles.artist}>{song.artist}</Text> : null}
          </View>

          {song?.description ? <Text style={styles.description}>{song.description}</Text> : null}

          <Pressable onPress={openSpotify} style={[styles.actionBtn, { backgroundColor: COLOR }]}>
            <Feather name="external-link" size={18} color="#FFFFFF" />
            <Text style={styles.actionText}>Abrir en Spotify</Text>
          </Pressable>

          <View style={styles.tipBox}>
            <Feather name="info" size={13} color={colors.info} />
            <Text style={styles.tipText}>
              Necesitas Spotify instalado (gratis) o una cuenta web para escuchar la canción completa.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
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
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  lockCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  lockTitle: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  lockDesc: { fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },

  hero: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  songTitle: { fontFamily: serif, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  artist: { fontSize: 14, color: colors.onSurfaceSecondary, fontWeight: "600" },
  description: { fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  tipBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    alignItems: "flex-start",
  },
  tipText: { flex: 1, fontSize: 12, color: colors.onSurfaceSecondary, lineHeight: 17 },
});
