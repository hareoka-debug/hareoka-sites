import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { getDeviceId, restoreByEmail, setLocalUnlocked } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onRestored: (unlocked: string[]) => void;
}

export default function RestoreModal({ visible, onClose, onRestored }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const saved = await storage.getItem("rapa-nui-email", "");
      if (saved) setEmail(saved as string);
    })();
  }, [visible]);

  const handleRestore = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Ingresa el email con el que pagaste.");
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const unlocked = await restoreByEmail(email.trim().toLowerCase(), deviceId);
      await storage.setItem("rapa-nui-email", email.trim().toLowerCase());
      await setLocalUnlocked(unlocked);
      if (unlocked.length <= 1) {
        setError("No encontramos ninguna compra o acceso con ese email.");
        return;
      }
      onRestored(unlocked);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <Pressable style={styles.grabber} onPress={onClose}>
              <Feather name="chevron-down" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
            <Text style={styles.title}>Restaurar acceso · <Text style={styles.titleEn}>Restore access</Text></Text>
            <Text style={styles.desc}>Ingresa el email con el que pagaste. Recuperamos todos tus accesos en este dispositivo.</Text>
            <Text style={styles.descEn}>Enter the email you paid with. We restore all your accesses on this device.</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.cta} onPress={handleRestore} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <Text style={styles.ctaText}>Verificar y entrar · Verify & enter</Text>
              )}
            </Pressable>
            <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
              <Feather name="arrow-left" size={16} color={colors.onSurfaceSecondary} />
              <Text style={styles.backText}>Volver · Back</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheetWrap: { maxHeight: "70%" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm },
  grabber: { alignSelf: "center", width: 44, height: 22, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  title: { fontFamily: serif, fontSize: 22, color: colors.onSurface },
  titleEn: { fontStyle: "italic", color: colors.onSurfaceSecondary, fontSize: 20 },
  desc: { fontSize: 14, color: colors.onSurfaceSecondary },
  descEn: { fontSize: 13, color: colors.onSurfaceTertiary, fontStyle: "italic", marginBottom: spacing.md },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    minHeight: 50, paddingHorizontal: spacing.md,
    fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  error: { color: colors.error, fontSize: 13 },
  cta: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm,
  },
  ctaText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  back: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 4, marginTop: spacing.md, padding: 8 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 13 },
});
