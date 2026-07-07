import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/src/lib/theme";

const MESSAGES = [
  "¡Iorana! Recuerda beber agua vai nativa de Rapa Nui 💧",
  "El sol de la isla no perdona: hidrátate con agua vai nativa",
  "Vai significa agua en rapanui. ¡Toma la tuya antes de partir!",
  "Compra tu agua vai nativa en Hanga Roa antes de salir a la ruta",
  "Un sorbo de agua vai cada 30 minutos mantiene tu caminata segura",
];

interface Props {
  onPress?: () => void;
}

export default function VaiBanner({ onPress }: Props) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % MESSAGES.length);
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [opacity]);

  const content = (
    <View style={styles.banner}>
      <View style={styles.drop}>
        <Feather name="droplet" size={16} color={colors.onBrand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>AGUA VAI NATIVA · RAPA NUI</Text>
        <Animated.Text style={[styles.message, { opacity }]} numberOfLines={2}>
          {MESSAGES[index]}
        </Animated.Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={16} color={colors.info} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} testID="vai-banner">
        {content}
      </Pressable>
    );
  }
  return <View testID="vai-banner">{content}</View>;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#E3EBEE",
    borderWidth: 1,
    borderColor: "#C9D6DC",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  drop: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "800",
    color: colors.info,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceSecondary,
    fontWeight: "500",
    marginTop: 1,
  },
});
