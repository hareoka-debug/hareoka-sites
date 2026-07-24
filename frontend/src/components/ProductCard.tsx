import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Product } from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";
import { clp } from "@/src/lib/i18n";

interface Props {
  product: Product;
  unlocked: boolean;
  onPress: () => void;
}

export default function ProductCard({ product, unlocked, onPress }: Props) {
  const free = product.always_free;
  const badge = free ? "ACTIVO" : unlocked ? "ACTIVO" : clp(product.amount_clp);
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, product.featured && styles.featured]} onPress={onPress}>
      {product.featured && !unlocked && (
        <View style={styles.featBadge}>
          <Feather name="star" size={12} color={colors.brand} />
          <Text style={styles.featText}>MÁS COMPLETO · BEST VALUE</Text>
        </View>
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
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.nameEn}>{product.name_en}</Text>
        <Text style={styles.short}>
          {product.short}  ·  <Text style={styles.shortEn}>{product.short_en}</Text>
        </Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>
            {free || unlocked ? "Ver contenido · View" : "Comprar acceso · Buy"}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.brand} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  featured: { borderColor: colors.brand, borderWidth: 2 },
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
});
