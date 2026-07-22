import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminRequest, ContentItem, fetchContent, fetchSong, SongConfig } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const ADMIN_KEY_STORAGE = "rapa-nui-admin-key";

type Tab = "sales" | "access" | "routes" | "agencies" | "restaurants" | "rentcars" | "emergencies" | "song" | "security";

const PRODUCTS_ADMIN: { id: string; label: string }[] = [
  { id: "routes-all", label: "Todas las 11 rutas ($5.000)" },
  { id: "routes-3", label: "3 rutas urbanas ($3.000)" },
  { id: "agencies", label: "Agencias de Tour ($3.000)" },
  { id: "restaurants", label: "Restaurantes ($3.000)" },
  { id: "rentcars", label: "Rent a Car ($3.000)" },
  { id: "song", label: "Canción Rapa Nui ($3.000)" },
];

const CLP = (n: number) => `$${(n || 0).toLocaleString("es-CL")}`;

export default function Admin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState("");
  const [logged, setLogged] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sales");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [wiped, setWiped] = useState(false);

  const wipeAppData = useCallback(async () => {
    // "Autodestrucción": borramos TODO el localStorage local, simulando
    // que la app se ha desinstalado. El intruso pierde su sesión, device_id,
    // acceso restaurado, etc. En web no podemos desinstalar de verdad, pero
    // sí resetear a estado de "nueva instalación".
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.localStorage.clear();
        window.sessionStorage?.clear?.();
      }
      // Además, limpiamos claves conocidas por si acaso.
      await storage.removeItem("rapa-nui-device-id");
      await storage.removeItem("rapa-nui-paid");
      await storage.removeItem("rapa-nui-email");
      await storage.removeItem("rapa-nui-pending-session");
      await storage.removeItem(ADMIN_KEY_STORAGE);
    } catch {
      /* ignore */
    }
    setWiped(true);
  }, []);

  const login = useCallback(async (k: string) => {
    try {
      await adminRequest("/admin/sales", k, "GET");
      await storage.setItem(ADMIN_KEY_STORAGE, k);
      setLogged(true);
      setError(null);
      setFailedAttempts(0);
      return true;
    } catch (e: any) {
      setError(e?.message || "Clave incorrecta");
      setFailedAttempts((prev) => prev + 1);
      return false;
    }
  }, []);

  useEffect(() => {
    // Por seguridad: SIEMPRE se pide la clave al entrar al panel, incluso si el
    // dueño ya la usó antes en este dispositivo. No autologin.
    setChecking(false);
  }, []);

  const doLogin = async () => {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await login(key.trim());
    setBusy(false);
    if (!ok) {
      // 3 intentos fallidos = autodestruir la sesión local del dispositivo
      const attempts = failedAttempts + 1;
      if (attempts >= 3) {
        const msg =
          "⚠️ ACCESO NO AUTORIZADO DETECTADO ⚠️\n\n" +
          "Este panel es exclusivo del dueño de la aplicación. " +
          "Tu intento ha sido registrado.\n\n" +
          "Por seguridad, la sesión y todos los datos locales de esta app " +
          "serán eliminados de este dispositivo.";
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert(msg);
        } else {
          Alert.alert("Acceso no autorizado", msg);
        }
        await wipeAppData();
        // Redirigir al home tras el borrado
        setTimeout(() => {
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.location.href = "/";
          } else {
            router.replace("/");
          }
        }, 200);
      }
    }
  };

  const logout = useCallback(async () => {
    await storage.removeItem(ADMIN_KEY_STORAGE);
    setLogged(false);
    setKey("");
    setError(null);
  }, []);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!logged) {
    if (wiped) {
      return (
        <View style={[styles.center, { paddingHorizontal: spacing.xxl }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.error }]}>
            <Feather name="alert-octagon" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.loginTitle}>Acceso denegado</Text>
          <Text style={[styles.loginSub, { textAlign: "center" }]}>
            Los datos locales de esta aplicación han sido eliminados por seguridad.
            {"\n\n"}
            Local app data has been erased for security reasons.
          </Text>
          <Pressable onPress={() => router.replace("/")} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Volver</Text>
          </Pressable>
        </View>
      );
    }
    const remainingAttempts = Math.max(0, 3 - failedAttempts);
    return (
      <View style={[styles.center, { paddingHorizontal: spacing.xxl }]}>
        <View style={styles.discreteIconsRow}>
          <Feather name="lock" size={26} color={colors.onSurface} />
          <Feather name="alert-triangle" size={26} color={colors.warning} />
        </View>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="••••••"
          placeholderTextColor={colors.onSurfaceTertiary}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
          testID="admin-key-input"
        />
        {error ? (
          <Text style={styles.errText}>
            {error}
            {failedAttempts > 0 && failedAttempts < 3
              ? `  ·  ${remainingAttempts} intento${remainingAttempts === 1 ? "" : "s"} restante${remainingAttempts === 1 ? "" : "s"} antes de bloqueo`
              : ""}
          </Text>
        ) : null}
        <Pressable
          onPress={doLogin}
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          testID="admin-login"
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <View style={styles.hivamanaRow}>
              <Text style={styles.primaryBtnText}>HIVAMANA</Text>
              <Feather name="alert-triangle" size={16} color={colors.onBrand} />
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => router.replace("/")} hitSlop={12}>
          <Text style={styles.backLink}>Volver a la app</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.replace("/")} hitSlop={12} style={styles.iconBtn} testID="admin-back">
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>Panel del Dueño</Text>
        <Pressable onPress={logout} hitSlop={12} style={styles.iconBtn} testID="admin-logout">
          <Feather name="log-out" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {(
          [
            { k: "sales", label: "Ventas", icon: "bar-chart-2" },
            { k: "access", label: "Acceso", icon: "user-check" },
            { k: "routes", label: "Rutas", icon: "map" },
            { k: "agencies", label: "Agencias", icon: "briefcase" },
            { k: "restaurants", label: "Restaurantes", icon: "coffee" },
            { k: "rentcars", label: "Rent a Car", icon: "truck" },
            { k: "emergencies", label: "Emergencias", icon: "alert-triangle" },
            { k: "song", label: "Canción", icon: "music" },
            { k: "security", label: "Seguridad", icon: "shield" },
          ] as { k: Tab; label: string; icon: any }[]
        ).map((t) => {
          const active = tab === t.k;
          return (
            <Pressable
              key={t.k}
              onPress={() => setTab(t.k)}
              style={[styles.tab, active && styles.tabActive]}
              testID={`tab-${t.k}`}
            >
              <Feather
                name={t.icon}
                size={13}
                color={active ? colors.onBrand : colors.onSurfaceSecondary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === "sales" ? (
        <SalesTab adminKey={key} />
      ) : tab === "access" ? (
        <AccessTab adminKey={key} />
      ) : tab === "routes" ? (
        <RoutesTab adminKey={key} />
      ) : tab === "song" ? (
        <SongTab adminKey={key} />
      ) : tab === "security" ? (
        <SecurityTab adminKey={key} onKeyChanged={(newKey) => setKey(newKey)} />
      ) : (
        <ContentTab adminKey={key} collection={tab} />
      )}
    </View>
  );
}

// ============== VENTAS ==============
function SalesTab({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminRequest("/admin/sales", adminKey, "GET");
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  const doReset = async () => {
    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      setResetMsg("Escribe RESET exactamente para confirmar.");
      return;
    }
    setResetting(true);
    setResetMsg(null);
    try {
      const r = await adminRequest("/admin/reset-sales", adminKey, "POST", { confirm: "RESET" });
      setResetMsg(
        `✅ Borradas ${r.transactions_removed} venta${r.transactions_removed === 1 ? "" : "s"} real${r.transactions_removed === 1 ? "" : "es"}. ` +
        `Accesos manuales preservados: ${r.manual_grants_preserved}.`
      );
      setShowReset(false);
      setResetConfirm("");
      await load();
    } catch (e: any) {
      setResetMsg(e?.message || "Error al borrar. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL RECAUDADO</Text>
          <Text style={styles.totalValue}>{CLP(data?.total_clp || 0)}</Text>
          <Text style={styles.totalMeta}>
            {data?.sales_count || 0} venta{data?.sales_count === 1 ? "" : "s"} real{data?.sales_count === 1 ? "" : "es"} · {data?.pending_count || 0} pendientes
          </Text>
          {data?.manual_grants_count > 0 ? (
            <Text style={[styles.totalMeta, { marginTop: 4, fontStyle: "italic" }]}>
              🎫 {data.manual_grants_count} acceso{data.manual_grants_count === 1 ? "" : "s"} manual{data.manual_grants_count === 1 ? "" : "es"} otorgado{data.manual_grants_count === 1 ? "" : "s"} (no cuentan en total)
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Ventas por producto</Text>
        {Object.entries(data?.by_product || {}).map(([pid, info]: any) => (
          <View key={pid} style={styles.row}>
            <Feather name="box" size={16} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{info.name || pid}</Text>
              <Text style={styles.rowSub}>{info.count} venta{info.count === 1 ? "" : "s"}</Text>
            </View>
            <Text style={styles.rowVal}>{CLP(info.total_clp)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Últimas ventas</Text>
        {(data?.recent || []).length === 0 ? (
          <Text style={styles.empty}>Sin transacciones todavía.</Text>
        ) : (
          (data?.recent || []).map((s: any, i: number) => (
            <View key={i} style={styles.row}>
              <Feather name="dollar-sign" size={14} color={colors.onSurfaceTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{CLP(s.amount_clp)}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {s.product_name || s.product_id || "—"} · {s.email || "—"}
                </Text>
              </View>
              <Text style={styles.rowSub}>
                {s.paid_at ? new Date(s.paid_at).toLocaleDateString("es-CL") : "—"}
              </Text>
            </View>
          ))
        )}

        {resetMsg ? (
          <Text style={[styles.msg, { color: resetMsg.startsWith("✅") ? colors.success : colors.error }]}>
            {resetMsg}
          </Text>
        ) : null}

        <Pressable style={styles.refreshBtn} onPress={load}>
          <Feather name="refresh-cw" size={14} color={colors.onSurfaceSecondary} />
          <Text style={styles.refreshText}>Actualizar</Text>
        </Pressable>

        <View style={{ height: spacing.lg }} />

        <Text style={[styles.sectionTitle, { color: colors.error }]}>Zona peligrosa</Text>
        <Text style={styles.rowSub}>
          Borra las ventas reales (Mercado Pago / Flow / Stripe) y su historial. Los accesos manuales que tú otorgaste desde el panel se mantienen intactos. Acción irreversible.
        </Text>
        <Pressable onPress={() => setShowReset(true)} style={styles.dangerBtn} testID="open-reset">
          <Feather name="trash-2" size={16} color={colors.onBrand} />
          <Text style={styles.dangerBtnText}>Borrar total recaudado y ventas</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showReset} transparent animationType="slide" onRequestClose={() => setShowReset(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Reset de ventas</Text>
              <Pressable onPress={() => setShowReset(false)} hitSlop={12}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.cardSub}>
              Esta acción borra las ventas REALES cobradas (Mercado Pago / Flow / Stripe) y devuelve el total recaudado a $0. NO borra los accesos manuales que tú otorgaste desde el panel. Escribe la palabra <Text style={{ fontWeight: "800" }}>RESET</Text> para confirmar.
            </Text>
            <TextInput
              value={resetConfirm}
              onChangeText={setResetConfirm}
              placeholder="Escribe RESET"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              autoCapitalize="characters"
              testID="reset-confirm-input"
            />
            {resetMsg ? (
              <Text style={[styles.msg, { color: resetMsg.startsWith("✅") ? colors.success : colors.error }]}>
                {resetMsg}
              </Text>
            ) : null}
            <Pressable
              onPress={doReset}
              disabled={resetting}
              style={[styles.dangerBtn, resetting && { opacity: 0.6 }]}
              testID="reset-submit"
            >
              {resetting ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.dangerBtnText}>Confirmar borrado</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ============== ACCESO MANUAL ==============
function AccessTab({ adminKey }: { adminKey: string }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMsg(null);
  };

  const selectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selected.size === PRODUCTS_ADMIN.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(PRODUCTS_ADMIN.map((p) => p.id)));
    }
  };

  const submit = async () => {
    setMsg(null);
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      setMsg({ ok: false, text: "Ingresa un email válido." });
      return;
    }
    if (selected.size === 0) {
      setMsg({ ok: false, text: "Elige al menos un producto tocando las opciones de arriba." });
      return;
    }
    setBusy(true);
    try {
      const productIds = Array.from(selected);
      let granted = 0;
      let already = 0;
      for (const pid of productIds) {
        const res = await adminRequest("/admin/grant", adminKey, "POST", {
          email: em,
          product_id: pid,
          note: note || null,
        });
        if (res.already_had_access) already++;
        else granted++;
      }
      setMsg({
        ok: true,
        text: `${em}: ${granted} producto${granted === 1 ? "" : "s"} otorgado${granted === 1 ? "" : "s"}, ${already} ya lo tenía${already === 1 ? "" : "n"}.`,
      });
      setEmail("");
      setNote("");
      setSelected(new Set());
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Error de conexión" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      setMsg({ ok: false, text: "Ingresa un email válido para revocar." });
      return;
    }
    setBusy(true);
    try {
      const res = await adminRequest("/admin/revoke", adminKey, "POST", { email: em });
      setMsg({
        ok: true,
        text: `Revocados: ${res.transactions_removed} pagos + ${res.grants_removed} grants`,
      });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Conceder acceso manual</Text>
        <Text style={styles.cardSub}>
          Si un cliente pagó por otra vía (transferencia, error de webhook, respaldo tras redeploy), ingrésalo aquí y podrá entrar con &quot;Restaurar acceso&quot; en la app.
        </Text>

        <Text style={styles.label}>Email del cliente</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="cliente@correo.com"
          placeholderTextColor={colors.onSurfaceTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          testID="grant-email"
        />

        <View style={styles.labelRow}>
          <Text style={styles.label}>Productos a otorgar (puedes elegir varios)</Text>
          <Pressable onPress={selectAll} hitSlop={8} testID="select-all">
            <Text style={styles.selectAllText}>
              {selected.size === PRODUCTS_ADMIN.length ? "Quitar todos" : "Elegir todos"}
            </Text>
          </Pressable>
        </View>
        <View style={{ gap: 8 }}>
          {PRODUCTS_ADMIN.map((p) => {
            const active = selected.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={[styles.productBtn, active && styles.productBtnActive]}
                testID={`grant-product-${p.id}`}
              >
                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                  {active ? <Feather name="check" size={16} color="#FFFFFF" /> : null}
                </View>
                <Text style={[styles.productBtnText, active && { color: colors.brand, fontWeight: "800" }]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Nota (opcional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Comprobante, fecha, medio de pago…"
          placeholderTextColor={colors.onSurfaceTertiary}
          multiline
          style={[styles.input, { minHeight: 60, textAlignVertical: "top", paddingTop: spacing.sm }]}
        />

        {msg ? (
          <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.error }]}>
            {msg.text}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy || selected.size === 0 || !email.trim()}
          style={[styles.primaryBtn, (busy || selected.size === 0 || !email.trim()) && { opacity: 0.4 }]}
          testID="grant-submit"
        >
          {busy ? <ActivityIndicator color={colors.onBrand} /> : (
            <Text style={styles.primaryBtnText}>
              {selected.size === 0
                ? "Elige al menos 1 producto"
                : `Conceder acceso (${selected.size} producto${selected.size === 1 ? "" : "s"})`}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={revoke} disabled={busy} style={styles.secondaryBtn} testID="grant-revoke">
          <Feather name="trash-2" size={13} color={colors.error} />
          <Text style={styles.secondaryText}>Revocar todos los accesos de este email</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ============== CONTENT CRUD ==============
function ContentTab({ adminKey, collection }: { adminKey: string; collection: string }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ContentItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchContent(collection);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing({
      id: "",
      name: "",
      phone: "",
      whatsapp: "",
      website: "",
      address: "",
      description: "",
      cuisine: collection === "restaurants" ? "" : undefined,
      category: collection === "emergencies" ? "" : undefined,
    });
  };

  const del = (item: ContentItem) => {
    const doDelete = async () => {
      try {
        await adminRequest(`/admin/content/${collection}/${item.id}`, adminKey, "DELETE");
        await load();
      } catch (e: any) {
        if (Platform.OS === "web") {
          window.alert(e?.message || "Error");
        } else {
          Alert.alert("Error", e?.message || "Error");
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`¿Eliminar "${item.name}"?`)) void doDelete();
    } else {
      Alert.alert("Eliminar", `¿Eliminar "${item.name}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.md,
        }}
      >
        <Pressable style={styles.primaryBtn} onPress={openNew} testID="content-new">
          <Feather name="plus" size={16} color={colors.onBrand} />
          <Text style={styles.primaryBtnText}>  Agregar nuevo</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>Aún no hay elementos. Agrega el primero.</Text>
        ) : (
          items.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                {it.phone ? <Text style={styles.itemMeta}>📞 {it.phone}</Text> : null}
                {it.address ? <Text style={styles.itemMeta}>📍 {it.address}</Text> : null}
                {it.category ? <Text style={styles.itemMeta}>🔖 {it.category}</Text> : null}
              </View>
              <Pressable style={styles.iconBtn} onPress={() => setEditing(it)} testID={`edit-${it.id}`}>
                <Feather name="edit-2" size={16} color={colors.brand} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => del(it)} testID={`delete-${it.id}`}>
                <Feather name="trash-2" size={16} color={colors.error} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <ContentEditor
        collection={collection}
        adminKey={adminKey}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </View>
  );
}

function ContentEditor({
  collection,
  adminKey,
  item,
  onClose,
  onSaved,
}: {
  collection: string;
  adminKey: string;
  item: ContentItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ContentItem | null>(item);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setForm(item);
    setErr(null);
  }, [item]);

  const save = async () => {
    if (!form || !form.name?.trim()) {
      setErr("El nombre es obligatorio.");
      return;
    }
    if (collection === "emergencies" && !form.phone?.trim()) {
      setErr("El teléfono es obligatorio para Emergencias.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: any = { name: form.name.trim() };
      for (const k of ["phone", "whatsapp", "website", "address", "description", "cuisine", "category"]) {
        const v = (form as any)[k];
        if (v && String(v).trim()) body[k] = String(v).trim();
      }
      if (form.id) {
        await adminRequest(`/admin/content/${collection}/${form.id}`, adminKey, "PUT", body);
      } else {
        await adminRequest(`/admin/content/${collection}`, adminKey, "POST", body);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const Field = ({ label, keyName, keyboardType, multiline }: any) => (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={((form as any) || {})[keyName] || ""}
        onChangeText={(v) => setForm((s) => ({ ...(s as ContentItem), [keyName]: v }))}
        keyboardType={keyboardType}
        multiline={!!multiline}
        placeholderTextColor={colors.onSurfaceTertiary}
        style={[
          styles.input,
          multiline && { minHeight: 60, textAlignVertical: "top", paddingTop: spacing.sm },
        ]}
      />
    </View>
  );

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalWrap}
      >
        <View style={styles.modalBox}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>
              {form?.id ? "Editar" : "Nuevo"} · {collection}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
            {Field({ label: "Nombre *", keyName: "name" })}
            {Field({ label: "Teléfono", keyName: "phone", keyboardType: "phone-pad" })}
            {Field({ label: "WhatsApp", keyName: "whatsapp", keyboardType: "phone-pad" })}
            {collection !== "emergencies" && Field({ label: "Sitio web", keyName: "website", keyboardType: "url" })}
            {collection !== "emergencies" && Field({ label: "Dirección", keyName: "address" })}
            {collection === "restaurants" && Field({ label: "Tipo de cocina", keyName: "cuisine" })}
            {collection === "emergencies" && Field({ label: "Categoría (Bomberos, Salud…)", keyName: "category" })}
            {Field({ label: "Descripción", keyName: "description", multiline: true })}
            {err ? <Text style={styles.errText}>{err}</Text> : null}
            <Pressable
              onPress={save}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              testID="content-save"
            >
              {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>Guardar</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============== RUTAS (view-only) ==============
function RoutesTab({ adminKey }: { adminKey: string }) {
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await adminRequest("/admin/routes", adminKey, "GET");
        setRoutes(r);
      } finally {
        setLoading(false);
      }
    })();
  }, [adminKey]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Las 11 rutas GPS</Text>
        <Text style={styles.cardSub}>
          Estas son las rutas que ven los clientes con acceso pagado. Las coordenadas y descripción están definidas en el código de la app para máxima estabilidad.
        </Text>
      </View>
      {routes.map((r) => (
        <View key={r.id} style={styles.itemCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{r.name}</Text>
            <Text style={styles.itemMeta}>
              📍 {r.type === "urbana" ? "Urbana" : "Rural"} · {r.distance_km} km · {r.duration_min} min · {r.difficulty}
            </Text>
            <Text style={styles.itemMeta}>🗿 {r.pois_count} puntos de interés</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ============== SEGURIDAD (cambiar clave) ==============
function SecurityTab({ adminKey, onKeyChanged }: { adminKey: string; onKeyChanged: (k: string) => void }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState("");
  const [newKey, setNewKey] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    if (newKey.length < 6) {
      setMsg({ ok: false, text: "La nueva clave debe tener al menos 6 caracteres." });
      return;
    }
    if (newKey !== confirm) {
      setMsg({ ok: false, text: "La nueva clave y su confirmación no coinciden." });
      return;
    }
    setBusy(true);
    try {
      await adminRequest("/admin/change-key", adminKey, "POST", {
        current_key: current,
        new_key: newKey,
      });
      // Actualiza clave activa en el panel
      await storage.setItem(ADMIN_KEY_STORAGE, newKey);
      onKeyChanged(newKey);
      setMsg({ ok: true, text: "✅ Clave actualizada. Úsala la próxima vez que ingreses." });
      setCurrent("");
      setNewKey("");
      setConfirm("");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cambiar clave del panel</Text>
        <Text style={styles.cardSub}>
          Cambia la clave que da acceso a este panel. Solo tú deberías conocerla. Mínimo 6 caracteres.
        </Text>

        <Text style={styles.label}>Clave actual</Text>
        <TextInput
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Tu clave actual"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          testID="current-key"
        />

        <Text style={styles.label}>Nueva clave</Text>
        <TextInput
          value={newKey}
          onChangeText={setNewKey}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Nueva clave (mín. 6 caracteres)"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          testID="new-key"
        />

        <Text style={styles.label}>Confirmar nueva clave</Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Repite la nueva clave"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          testID="confirm-key"
        />

        {msg ? (
          <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.error }]}>
            {msg.text}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          testID="change-key-submit"
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryBtnText}>Cambiar clave</Text>
          )}
        </Pressable>

        <Text style={[styles.cardSub, { fontStyle: "italic", marginTop: spacing.sm }]}>
          ⚠️ Anota tu nueva clave en un lugar seguro. Si la olvidas, no hay forma de recuperarla desde la app.
        </Text>
      </View>
    </ScrollView>
  );
}

// ============== CANCIÓN ==============
function SongTab({ adminKey }: { adminKey: string }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SongConfig>({
    title: "",
    artist: "",
    spotify_url: "",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchSong()
      .then((s) => setForm(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.title.trim() || !form.spotify_url.trim()) {
      setMsg("Título y URL de Spotify son obligatorios.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await adminRequest("/admin/song", adminKey, "POST", form);
      setMsg("Canción guardada correctamente.");
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Canción Rapa Nui</Text>
        <Text style={styles.cardSub}>Configura la canción tradicional que verán los clientes.</Text>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          value={form.title}
          onChangeText={(v) => setForm({ ...form, title: v })}
          style={styles.input}
          placeholderTextColor={colors.onSurfaceTertiary}
        />

        <Text style={styles.label}>Artista</Text>
        <TextInput
          value={form.artist}
          onChangeText={(v) => setForm({ ...form, artist: v })}
          style={styles.input}
          placeholderTextColor={colors.onSurfaceTertiary}
        />

        <Text style={styles.label}>URL de Spotify *</Text>
        <TextInput
          value={form.spotify_url}
          onChangeText={(v) => setForm({ ...form, spotify_url: v })}
          placeholder="https://open.spotify.com/track/..."
          autoCapitalize="none"
          keyboardType="url"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
        />

        <Text style={styles.label}>Descripción</Text>
        <TextInput
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { minHeight: 80, textAlignVertical: "top", paddingTop: spacing.sm }]}
        />

        {msg ? (
          <Text
            style={[styles.msg, { color: msg.startsWith("Error") ? colors.error : colors.success }]}
          >
            {msg}
          </Text>
        ) : null}

        <Pressable
          onPress={save}
          disabled={busy}
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          testID="song-save"
        >
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>Guardar canción</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  discreteIconsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  hivamanaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginTitle: { fontFamily: serif, fontSize: 26, color: colors.onSurface },
  loginSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginBottom: spacing.md },
  input: {
    alignSelf: "stretch",
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  errText: { color: colors.error, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
  },
  primaryBtnText: { color: colors.onBrand, fontSize: 15, fontWeight: "800" },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.error,
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  dangerBtnText: { color: colors.onBrand, fontSize: 14, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  secondaryText: { color: colors.error, fontSize: 12, textDecorationLine: "underline" },
  backLink: { color: colors.onSurfaceTertiary, fontSize: 13, textDecorationLine: "underline" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabs: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  tabTextActive: { color: colors.onBrand },

  totalCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  totalLabel: { color: colors.warning, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  totalValue: { fontFamily: serif, fontSize: 38, color: colors.onSurfaceInverse, marginTop: 4 },
  totalMeta: { color: "rgba(249,248,246,0.7)", fontSize: 13, marginTop: 4 },
  sectionTitle: { fontFamily: serif, fontSize: 18, color: colors.onSurface, marginTop: spacing.sm },
  empty: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", paddingVertical: spacing.md },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
  rowVal: { fontSize: 14, fontWeight: "700", color: colors.success },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  refreshText: { color: colors.onSurfaceSecondary, fontSize: 13 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  cardSub: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19, marginBottom: spacing.xs },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  productBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 56,
    backgroundColor: "#FFFFFF",
  },
  productBtnActive: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brand,
    borderWidth: 2.5,
  },
  productBtnText: { fontSize: 14, color: colors.onSurface, flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.onSurfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
    textDecorationLine: "underline",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.onSurfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: colors.brand,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },

  msg: { fontSize: 13, fontWeight: "500" },

  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  itemName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: "90%",
    gap: spacing.md,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface, flex: 1 },
});
