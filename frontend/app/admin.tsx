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

type Tab = "sales" | "access" | "agencies" | "restaurants" | "rentcars" | "emergencies" | "song";

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

  const login = useCallback(async (k: string) => {
    try {
      await adminRequest("/admin/sales", k, "GET");
      await storage.setItem(ADMIN_KEY_STORAGE, k);
      setLogged(true);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message || "Clave incorrecta");
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem(ADMIN_KEY_STORAGE, "");
      if (saved) {
        setKey(saved);
        await login(saved);
      }
      setChecking(false);
    })();
  }, [login]);

  const doLogin = async () => {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await login(key.trim());
    setBusy(false);
  };

  const logout = async () => {
    await storage.removeItem(ADMIN_KEY_STORAGE);
    setLogged(false);
    setKey("");
  };

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!logged) {
    return (
      <View style={[styles.center, { paddingHorizontal: spacing.xxl }]}>
        <View style={styles.lockIcon}>
          <Feather name="lock" size={28} color={colors.onBrand} />
        </View>
        <Text style={styles.loginTitle}>Panel del Dueño</Text>
        <Text style={styles.loginSub}>Acceso exclusivo del administrador.</Text>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="Clave de administrador"
          placeholderTextColor={colors.onSurfaceTertiary}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
          testID="admin-key-input"
        />
        {error ? <Text style={styles.errText}>{error}</Text> : null}
        <Pressable
          onPress={doLogin}
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          testID="admin-login"
        >
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>Entrar</Text>}
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
        contentContainerStyle={styles.tabs}
      >
        {(
          [
            { k: "sales", label: "Ventas", icon: "bar-chart-2" },
            { k: "access", label: "Acceso", icon: "user-check" },
            { k: "agencies", label: "Agencias", icon: "briefcase" },
            { k: "restaurants", label: "Restaurantes", icon: "coffee" },
            { k: "rentcars", label: "Rent a Car", icon: "truck" },
            { k: "emergencies", label: "Emergencias", icon: "alert-triangle" },
            { k: "song", label: "Canción", icon: "music" },
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
      ) : tab === "song" ? (
        <SongTab adminKey={key} />
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
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL RECAUDADO</Text>
        <Text style={styles.totalValue}>{CLP(data?.total_clp || 0)}</Text>
        <Text style={styles.totalMeta}>
          {data?.sales_count || 0} ventas · {data?.pending_count || 0} pendientes
        </Text>
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

      <Pressable style={styles.refreshBtn} onPress={load}>
        <Feather name="refresh-cw" size={14} color={colors.onSurfaceSecondary} />
        <Text style={styles.refreshText}>Actualizar</Text>
      </Pressable>
    </ScrollView>
  );
}

// ============== ACCESO MANUAL ==============
function AccessTab({ adminKey }: { adminKey: string }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState("routes-all");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      setMsg({ ok: false, text: "Ingresa un email válido." });
      return;
    }
    setBusy(true);
    try {
      const res = await adminRequest("/admin/grant", adminKey, "POST", {
        email: em,
        product_id: productId,
        note: note || null,
      });
      const productLabel = PRODUCTS_ADMIN.find((p) => p.id === productId)?.label || productId;
      setMsg({
        ok: true,
        text: res.already_had_access
          ? `${em} ya tenía ${productLabel}`
          : `Acceso otorgado a ${em}: ${productLabel}`,
      });
      setEmail("");
      setNote("");
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
          Si un cliente pagó por otra vía (transferencia, error de webhook, respaldo tras redeploy), ingrésalo aquí y podrá entrar con "Restaurar acceso" en la app.
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

        <Text style={styles.label}>Producto a otorgar</Text>
        <View style={{ gap: 6 }}>
          {PRODUCTS_ADMIN.map((p) => {
            const active = p.id === productId;
            return (
              <Pressable
                key={p.id}
                onPress={() => setProductId(p.id)}
                style={[styles.productBtn, active && styles.productBtnActive]}
              >
                <Feather
                  name={active ? "check-circle" : "circle"}
                  size={16}
                  color={active ? colors.brand : colors.onSurfaceTertiary}
                />
                <Text style={[styles.productBtnText, active && { color: colors.brand, fontWeight: "700" }]}>
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
          disabled={busy}
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          testID="grant-submit"
        >
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>Conceder acceso</Text>}
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

  tabs: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    height: 36,
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
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  productBtnActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  productBtnText: { fontSize: 13, color: colors.onSurface, flex: 1 },

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
