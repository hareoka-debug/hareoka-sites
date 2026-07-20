import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { checkPaymentStatus, clearPendingSession, verifyEmailOnly, getDeviceId } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

export default function PaymentSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tx?: string }>();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"checking" | "ok" | "pending" | "error">("checking");
  const [productId, setProductId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const tx = params.tx;
      if (!tx) {
        setStatus("error");
        return;
      }
      // Poll el estado hasta 20s
      for (let i = 0; i < 10; i++) {
        try {
          const s = await checkPaymentStatus(tx);
          if (s.payment_status === "paid") {
            await clearPendingSession();
            const email = await storage.getItem("rapa-nui-email", "");
            if (email) {
              try {
                const dev = await getDeviceId();
                await verifyEmailOnly(dev, email);
              } catch {
                /* ignore */
              }
            }
            setProductId(s.product_id || "");
            setStatus("ok");
            return;
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setStatus("pending");
    })();
  }, [params.tx]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xxl }]}>
      {status === "checking" ? (
        <>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.title}>Verificando tu pago…</Text>
          <Text style={styles.desc}>Un momento por favor.</Text>
        </>
      ) : status === "ok" ? (
        <>
          <View style={styles.iconOk}>
            <Feather name="check" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>¡Pago confirmado!</Text>
          <Text style={styles.desc}>
            Ya tienes acceso a tu contenido. Nos vemos en la app.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.replace("/")}>
            <Text style={styles.btnText}>Ir al inicio</Text>
          </Pressable>
        </>
      ) : status === "pending" ? (
        <>
          <View style={styles.iconPend}>
            <Feather name="clock" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Pago en proceso</Text>
          <Text style={styles.desc}>
            Tu pago puede tardar unos minutos en confirmarse. Vuelve al inicio e ingresa con tu email cuando llegue el correo del proveedor.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.replace("/")}>
            <Text style={styles.btnText}>Volver al inicio</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.iconErr}>
            <Feather name="x" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>No pudimos verificar el pago</Text>
          <Text style={styles.desc}>Intenta nuevamente desde el inicio.</Text>
          <Pressable style={styles.btn} onPress={() => router.replace("/")}>
            <Text style={styles.btnText}>Volver</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  iconOk: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPend: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  iconErr: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: serif, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  desc: { fontSize: 14, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: colors.onBrand, fontSize: 15, fontWeight: "800" },
});
