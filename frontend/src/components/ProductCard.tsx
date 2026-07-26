import React, { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

import { Product } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";
import { clp } from "@/src/lib/i18n";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  product: Product;
  unlocked: boolean;
  onPress: () => void;
}

export default function ProductCard({ product, unlocked, onPress }: Props) {
  const free = product.always_free;
  const badge = free ? "ACTIVO" : unlocked ? "ACTIVO" : clp(product.amount_clp);

  // Pulso solo para la tarjeta destacada y aún no comprada
  const pulseActive = product.featured && !unlocked && !free;

  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const badgePulse = useSharedValue(1);

  useEffect(() => {
    if (!pulseActive) return;

    scale.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    badgePulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(glow);
      cancelAnimation(badgePulse);
    };
  }, [pulseActive, scale, glow, badgePulse]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: 0.15 + glow.value * 0.35,
    shadowRadius: 8 + glow.value * 16,
    // en web, esta interpolación crea el "glow" con box-shadow
    ...(pulseActive
      ? {
          shadowColor: colors.brand,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4 + glow.value * 8,
        }
      : {}),
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.value * 0.55,
    transform: [{ scale: 1 + glow.value * 0.02 }],
  }));

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgePulse.value }],
  }));

  return (
    <View style={pulseActive ? styles.featuredWrap : undefined}>
      {pulseActive && (
        <Animated.View pointerEvents="none" style={[styles.pulseRing, animatedRingStyle]} />
      )}
      <AnimatedPressable
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: 0.9 },
          product.featured && styles.featured,
          pulseActive && animatedCardStyle,
        ]}
        onPress={onPress}
      >
        {product.featured && !unlocked && (
          <Animated.View style={[styles.featBadge, pulseActive && animatedBadgeStyle]}>
            <Feather name="star" size={12} color={colors.brand} />
            <Text style={styles.featText}>MÁS COMPLETO · BEST VALUE</Text>
          </Animated.View>
        )}
        <View style={styles.imageWrap}>
          <Image source={{ uri: product.image }} style={styles.image} />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.iconBubble, { backgroundColor: product.color }]}>
            <Feather name={product.icon as any} size={18} color="#FFF" />
          </View>
          <View style={[styles.priceTag, (free || unlocked) && styles.priceTagFree]}>
            {(free || unlocked) ? (
              <>
                <Feather name="unlock" size={11} color="#FFF" />
                <Text style={styles.priceTagFreeText}>{badge}</Text>
              </>
            ) : (
              <Text style={styles.priceTagText}>{badge}</Text>
            )}
          </View>
          {pulseActive && (
            <Animated.View pointerEvents="none" style={[styles.hotBadge, animatedBadgeStyle]}>
              <Text style={styles.hotBadgeText}>🔥 MÁS ELEGIDO · MOST CHOSEN</Text>
            </Animated.View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.nameEn}>{product.name_en}</Text>
          <Text style={styles.short}>
            {product.short}  ·  <Text style={styles.shortEn}>{product.short_en}</Text>
          </Text>
          <View style={styles.cta}>
            <Text style={[styles.ctaText, pulseActive && styles.ctaTextFeatured]}>
              {free || unlocked ? "Ver contenido · View" : "Comprar acceso · Buy"}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.brand} />
          </View>
        </View>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  featuredWrap: {
    position: "relative",
    marginBottom: spacing.lg,
  },
  pulseRing: {
    position: "absolute",
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: radius.lg + 6,
    borderWidth: 3,
    borderColor: colors.brand,
    backgroundColor: "transparent",
    zIndex: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  featured: {
    borderColor: colors.brand,
    borderWidth: 2,
    marginBottom: 0,
  },
  featBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 3,
  },
  featText: { fontSize: 10, fontWeight: "800", color: colors.brand, letterSpacing: 0.8 },
  hotBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  hotBadgeText: { fontSize: 11, fontWeight: "800", color: "#FFF", letterSpacing: 1 },
  imageWrap: { height: 160, position: "relative", backgroundColor: "#0002" },
  image: { width: "100%", height: "100%" },
  iconBubble: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  priceTag: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  priceTagText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  priceTagFree: { backgroundColor: colors.onSurface, flexDirection: "row", alignItems: "center", gap: 5 },
  priceTagFreeText: { fontSize: 11, fontWeight: "800", color: "#FFF", letterSpacing: 0.8 },
  body: { padding: spacing.lg, gap: 4 },
  name: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  nameEn: { fontFamily: serif, fontStyle: "italic", fontSize: 15, color: colors.onSurfaceSecondary },
  short: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
  shortEn: { fontStyle: "italic" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
  },
  ctaText: { color: colors.brand, fontWeight: "700", fontSize: 14 },
  ctaTextFeatured: { fontWeight: "800", fontSize: 15 },
});
