import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Diálogo de confirmación cross-platform.
 * En web `Alert.alert` de React Native no dispara los onPress → usamos window.confirm.
 * En native usa Alert.alert normal.
 */
function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

import { storage } from "@/src/utils/storage";
import {
  AdminSales,
  ContentItem,
  Product,
  Song,
  adminChangePassword,
  adminCreateContent,
  adminDeleteContent,
  adminFetchSales,
  adminGetSong,
  adminGrantManual,
  adminListContent,
  adminListManual,
  adminListRoutes,
  adminResetSales,
  adminRevokeManual,
  adminSaveSong,
  adminUpdateContent,
  fetchProducts,
  getDeviceId,
  selfDestructAccess,
  adminRegisterDevice,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const ADMIN_KEY_STORAGE = "rapa-nui-admin-key";
const ATTEMPTS_STORAGE = "rapa-nui-admin-attempts";

type Tab = "ventas" | "acceso" | "rutas" | "agencies" | "restaurants" | "rentcars" | "emergencies" | "cancion" | "seguridad";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "ventas", label: "Ventas", icon: "bar-chart-2" },
  { key: "acceso", label: "Acceso", icon: "user-plus" },
  { key: "rutas", label: "Rutas", icon: "map" },
  { key: "agencies", label: "Agencias", icon: "briefcase" },
  { key: "restaurants", label: "Restaurantes", icon: "coffee" },
  { key: "rentcars", label: "Rent a Car", icon: "truck" },
  { key: "emergencies", label: "Emergencias", icon: "alert-triangle" },
  { key: "cancion", label: "Canción", icon: "music" },
  { key: "seguridad", label: "Seguridad", icon: "shield" },
];

const clp = (n: number) => `$${n.toLocaleString("es-CL")} CLP`;

export default function AdminPanel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingStored, setCheckingStored] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ventas");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [phase, setPhase] = useState<"idle" | "warning" | "destroyed">("idle");

  useEffect(() => {
    (async () => {
      // Restaurar contador de intentos (persiste entre reloads para no dar segunda oportunidad)
      try {
        const raw = await storage.getItem(ATTEMPTS_STORAGE, "");
        const n = raw ? parseInt(raw as string, 10) : 0;
        if (!Number.isNaN(n) && n > 0) {
          setFailedAttempts(n);
          if (n === 1) setPhase("warning");
        }
      } catch {}

      const stored = await storage.getItem(ADMIN_KEY_STORAGE, "");
      if (stored) {
        try {
          await adminFetchSales(stored as string);
          setKey(stored as string);
          setAuthed(true);
          // Blindaje: al reabrir el admin con sesión guardada, reafirmar
          // que este dispositivo es del dueño.
          try {
            const deviceId = await getDeviceId();
            await adminRegisterDevice(stored as string, deviceId);
          } catch {}
        } catch {}
      }
      setCheckingStored(false);
    })();
  }, []);

  const clearAllLocalStorage = async () => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {}
    for (const k of [
      ADMIN_KEY_STORAGE,
      ATTEMPTS_STORAGE,
      "rapa-nui-email",
      "rapa-nui-device-id",
      "rapa-nui-unlocked",
      "rapa-nui-pending-session",
    ]) {
      try { await storage.removeItem(k); } catch {}
    }
  };

  const executeSelfDestruct = async () => {
    setPhase("destroyed");
    setError(null);
    // 1) Servidor: borrar pagos + grants EXCLUSIVAMENTE del device actual
    //    (nunca por email → no afecta otros dispositivos ni otros clientes).
    //    Si este device está marcado como dueño, el backend rechaza la operación.
    try {
      const deviceId = await getDeviceId();
      await selfDestructAccess(deviceId);
    } catch {
      // continuar aunque falle el server; el borrado local igual protege
    }
    // 2) Local: borrar todo el storage del navegador
    await clearAllLocalStorage();
    // 3) Redirect a home tras 4s (usuario alcanza a leer el mensaje)
    setTimeout(() => {
      router.replace("/");
    }, 4200);
  };

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await adminFetchSales(key.trim());
      // ÉXITO — resetear contador y guardar la clave
      await storage.setItem(ADMIN_KEY_STORAGE, key.trim());
      await storage.removeItem(ATTEMPTS_STORAGE);
      setFailedAttempts(0);
      setPhase("idle");
      setAuthed(true);
      // Blindaje: registrar este device como dispositivo del dueño para
      // que la autodestrucción jamás pueda afectarlo.
      try {
        const deviceId = await getDeviceId();
        await adminRegisterDevice(key.trim(), deviceId);
      } catch {}
    } catch (e: any) {
      // Autodestrucción al 2° intento fallido
      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);
      try { await storage.setItem(ATTEMPTS_STORAGE, String(nextCount)); } catch {}

      if (nextCount >= 2) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await executeSelfDestruct();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPhase("warning");
      }
    } finally {
      setLoading(false);
    }
  };

  const clearStoredKey = async () => {
    await storage.removeItem(ADMIN_KEY_STORAGE);
    setKey("");
    setError(null);
  };

  const handleLogout = async () => {
    await storage.removeItem(ADMIN_KEY_STORAGE);
    setAuthed(false);
    setKey("");
  };

  if (checkingStored) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  // Pantalla de autodestrucción ejecutada
  if (phase === "destroyed") {
    return (
      <View style={styles.destroyedScreen}>
        <View style={styles.destroyedIconWrap}>
          <Feather name="alert-octagon" size={70} color="#FFF" />
        </View>
        <Text style={styles.destroyedTitle}>ACCESO NO AUTORIZADO</Text>
        <Text style={styles.destroyedSub}>Superaste el número de intentos permitido.</Text>
        <View style={styles.destroyedBox}>
          <Text style={styles.destroyedListTitle}>Tu acceso ha sido eliminado:</Text>
          <Text style={styles.destroyedItem}>• Se borraron tus compras del servidor.</Text>
          <Text style={styles.destroyedItem}>• Se borraron tus accesos otorgados.</Text>
          <Text style={styles.destroyedItem}>• Se borraron todos los datos locales del navegador.</Text>
        </View>
        <Text style={styles.destroyedFoot}>Serás redirigido a la app en unos segundos…</Text>
        <ActivityIndicator size="small" color="#FFF" style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!authed) {
    const isWarning = phase === "warning";
    return (
      <View style={[styles.center, { paddingHorizontal: spacing.xxl, gap: spacing.md }]}>
        {isWarning && (
          <View style={styles.warningBanner}>
            <Feather name="alert-triangle" size={28} color="#FFF" />
            <Text style={styles.warningTitle}>⚠️ ÚLTIMO INTENTO</Text>
            <Text style={styles.warningText}>
              Al próximo intento fallido, TU acceso a esta aplicación será eliminado por completo, aunque hayas pagado.
            </Text>
            <Text style={styles.warningTextEn}>
              On the next failed attempt, your access to this app will be permanently deleted, even if you have paid.
            </Text>
          </View>
        )}
        <View style={styles.lockRow}>
          <Feather name="lock" size={28} color={colors.onSurfaceSecondary} />
          <Feather name="alert-triangle" size={20} color={colors.warning} />
        </View>
        <TextInput
          style={[styles.keyInput, isWarning && styles.keyInputWarning]}
          placeholder="Clave"
          placeholderTextColor={colors.onSurfaceTertiary}
          value={key}
          onChangeText={setKey}
          secureTextEntry
          autoCapitalize="none"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.hivamanaBtn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.hivamanaText}>HIVAMANA</Text>
              <Feather name="alert-triangle" size={16} color="#FFF" />
            </>
          )}
        </Pressable>
        {!isWarning && (
          <Pressable onPress={clearStoredKey} hitSlop={12}>
            <Text style={styles.helpLink}>¿Problemas? Borrar clave guardada e intentar de nuevo</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.replace("/")} hitSlop={12}>
          <Text style={styles.backLink}>Volver a la app</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.replace("/")} style={styles.headerBtn} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Panel del Dueño</Text>
        <Pressable onPress={handleLogout} style={styles.headerBtn} hitSlop={12}>
          <Feather name="log-out" size={18} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, active && styles.tabActive]}>
              <Feather name={t.icon} size={13} color={active ? "#FFF" : colors.onSurfaceSecondary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === "ventas" && <VentasTab adminKey={key} bottomInset={insets.bottom} />}
      {tab === "acceso" && <AccesoTab adminKey={key} bottomInset={insets.bottom} />}
      {tab === "rutas" && <RutasTab adminKey={key} bottomInset={insets.bottom} />}
      {(tab === "agencies" || tab === "restaurants" || tab === "rentcars" || tab === "emergencies" || tab === "cancion") && (
        <ContentTab adminKey={key} collection={tab === "cancion" ? "songs" : tab} bottomInset={insets.bottom} />
      )}
      {tab === "seguridad" && <SeguridadTab adminKey={key} bottomInset={insets.bottom} onKeyChanged={setKey} />}
    </View>
  );
}

// ---------- Ventas ----------
function VentasTab({ adminKey, bottomInset }: { adminKey: string; bottomInset: number }) {
  const [sales, setSales] = useState<AdminSales | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await adminFetchSales(adminKey);
      setSales(s);
    } catch {}
  }, [adminKey]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const resetAll = () => {
    confirmAction(
      "¿Borrar todas las ventas?",
      "Esto elimina el historial de pagos y accesos de webhook, pero mantiene tus accesos manuales. Acción irreversible.",
      "Sí, borrar",
      async () => {
        try {
          await adminResetSales(adminKey);
          await load();
        } catch (e) {
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.alert("Error al borrar. Revisa tu conexión y reintenta.");
          } else {
            Alert.alert("Error", "No se pudo borrar. Reintenta.");
          }
        }
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL RECAUDADO</Text>
        <Text style={styles.totalValue}>{clp(sales?.total_clp ?? 0)}</Text>
        <Text style={styles.totalMetaText}>{sales?.sales_count ?? 0} ventas reales · {sales?.pending_count ?? 0} pendientes</Text>
        {(sales?.granted_count ?? 0) > 0 && (
          <Text style={styles.grantedText}>🎫 {sales!.granted_count} accesos manuales otorgados (no cuentan en total)</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Ventas por producto</Text>
      {Object.keys(sales?.by_product ?? {}).length === 0 ? (
        <Text style={styles.empty}>Sin ventas todavía.</Text>
      ) : (
        Object.entries(sales!.by_product).map(([pid, d]) => (
          <View key={pid} style={styles.provRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.provName}>{d.name}</Text>
              <Text style={styles.provCount}>{d.count} venta{d.count === 1 ? "" : "s"}</Text>
            </View>
            <Text style={styles.provTotal}>{clp(d.total_clp)}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Últimas ventas</Text>
      {(sales?.recent ?? []).length === 0 ? (
        <Text style={styles.empty}>Sin transacciones todavía.</Text>
      ) : sales!.recent.map((r, i) => (
        <View key={i} style={styles.saleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.saleAmount}>{clp(r.amount_clp)}</Text>
            <Text style={styles.saleMeta}>{r.provider} · {r.email || "—"}</Text>
            {r.product_name && <Text style={styles.saleMeta}>🛒 {r.product_name}</Text>}
          </View>
          <Text style={styles.saleDate}>{r.paid_at ? new Date(r.paid_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—"}</Text>
        </View>
      ))}

      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>Zona peligrosa</Text>
        <Text style={styles.dangerText}>Borra las ventas reales (Mercado Pago / Flow / Stripe) y su historial. Los accesos manuales que tú otorgaste desde el panel se mantienen intactos. Acción irreversible.</Text>
        <Pressable style={styles.dangerBtn} onPress={resetAll}>
          <Feather name="trash-2" size={16} color="#FFF" />
          <Text style={styles.dangerBtnText}>Borrar total recaudado y ventas</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------- Acceso ----------
function AccesoTab({ adminKey, bottomInset }: { adminKey: string; bottomInset: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [total, setTotal] = useState(0);
  const [applyHere, setApplyHere] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchProducts();
      setProducts(list.filter((p) => !p.always_free));
      const l = await adminListManual(adminKey);
      setTotal(l.total);
    } catch {}
  }, [adminKey]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const selectAll = () => setSelected(products.map((p) => p.id));

  const grant = async () => {
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg({ ok: false, text: "Email inválido" }); return; }
    if (selected.length === 0) { setMsg({ ok: false, text: "Elige al menos 1 producto" }); return; }
    setSaving(true);
    try {
      const emailTrim = email.trim();
      const selectedCopy = [...selected];
      let bindDeviceId: string | null = null;
      if (applyHere) {
        try { bindDeviceId = await getDeviceId(); } catch {}
      }
      await adminGrantManual(adminKey, emailTrim, selectedCopy, note.trim(), bindDeviceId);

      if (applyHere) {
        // Guardar el email localmente para que la app reconozca el desbloqueo inmediato
        try { await storage.setItem("rapa-nui-email", emailTrim); } catch {}
        setMsg({
          ok: true,
          text: `✓ Acceso concedido a ${emailTrim} y aplicado a este dispositivo. Ya puedes abrir los productos.`,
        });
      } else {
        const count = selectedCopy.length;
        setMsg({
          ok: true,
          text: `✓ Acceso concedido a ${emailTrim} (${count} producto${count === 1 ? "" : "s"}).`,
        });
      }
      setEmail(""); setSelected([]); setNote(""); setApplyHere(false);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Error" });
    } finally { setSaving(false); }
  };

  const revoke = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg({ ok: false, text: "Email inválido" }); return; }
    confirmAction(
      "¿Revocar accesos?",
      `Se revocarán TODOS los accesos manuales de ${email.trim()}`,
      "Sí, revocar",
      async () => {
        try {
          await adminRevokeManual(adminKey, email.trim());
          setMsg({ ok: true, text: "✓ Accesos revocados" });
          setEmail("");
          await load();
        } catch (e: any) {
          setMsg({ ok: false, text: e?.message || "Error al revocar" });
        }
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.sm }}>
      <View style={styles.card}>
        <View style={styles.iconBubble}><Feather name="user-plus" size={20} color="#FFF" /></View>
        <Text style={styles.cardTitle}>Conceder acceso manual</Text>
        <Text style={styles.cardSub}>Otorga acceso directo a cualquier email (incluido el tuyo) a uno o varios productos. Si marcas &quot;Aplicar a este dispositivo&quot;, quedará desbloqueado aquí de inmediato.</Text>

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput style={styles.input} placeholder="cliente@correo.com" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />

        <Text style={styles.fieldLabel}>Productos a otorgar (puedes elegir varios)</Text>
        <Pressable onPress={selectAll} hitSlop={12} style={{ paddingVertical: 8 }}>
          <Text style={styles.selectAll}>Elegir todos</Text>
        </Pressable>
        {products.map((p) => {
          const active = selected.includes(p.id);
          return (
            <Pressable
              key={p.id}
              style={({ pressed }) => [styles.checkRow, active && styles.checkRowActive, pressed && { opacity: 0.7 }]}
              onPress={() => toggle(p.id)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${active ? "Quitar" : "Añadir"} ${p.name}`}
              testID={`chk-${p.id}`}
            >
              <View style={[styles.checkbox, active && styles.checkboxActive]}>
                {active && <Feather name="check" size={14} color="#FFF" />}
              </View>
              <Text style={styles.checkName}>{p.name} <Text style={styles.checkPrice}>(${p.amount_clp.toLocaleString("es-CL")})</Text></Text>
            </Pressable>
          );
        })}

        <Text style={styles.fieldLabel}>Nota (opcional)</Text>
        <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="comprobante, fecha, proveedor…" placeholderTextColor={colors.onSurfaceTertiary} value={note} onChangeText={setNote} multiline />

        <Pressable
          style={({ pressed }) => [styles.checkRow, applyHere && styles.checkRowActive, pressed && { opacity: 0.7 }, { marginTop: spacing.md }]}
          onPress={() => setApplyHere((v) => !v)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: applyHere }}
          testID="chk-apply-here"
        >
          <View style={[styles.checkbox, applyHere && styles.checkboxActive]}>
            {applyHere && <Feather name="check" size={14} color="#FFF" />}
          </View>
          <Text style={styles.checkName}>
            Aplicar también a este dispositivo{" "}
            <Text style={styles.checkPrice}>(desbloqueo inmediato aquí)</Text>
          </Text>
        </Pressable>

        {selected.length > 0 && (
          <Text style={styles.helperCount}>
            {selected.length} producto{selected.length === 1 ? "" : "s"} seleccionado{selected.length === 1 ? "" : "s"}
          </Text>
        )}

        {msg && (
          <View style={[styles.msgBox, msg.ok ? styles.msgBoxOk : styles.msgBoxErr]}>
            <Feather name={msg.ok ? "check-circle" : "alert-circle"} size={18} color={msg.ok ? colors.success : colors.error} />
            <Text style={[styles.msgBoxText, { color: msg.ok ? colors.success : colors.error }]}>{msg.text}</Text>
          </View>
        )}

        <Pressable
          style={[styles.grantBtn, saving && { opacity: 0.6 }]}
          onPress={grant}
          disabled={saving}
          testID="btn-conceder-acceso"
        >
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.grantBtnText}>Conceder acceso</Text>}
        </Pressable>

        <Text style={styles.totalLine}>Total accesos concedidos manualmente: {total}</Text>

        <Pressable onPress={revoke} style={styles.revokeBtn}>
          <Feather name="user-x" size={14} color={colors.error} />
          <Text style={styles.revokeText}>Revocar todos los accesos de este email</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------- Rutas ----------
function RutasTab({ adminKey, bottomInset }: { adminKey: string; bottomInset: number }) {
  const [routes, setRoutes] = useState<any[]>([]);
  useEffect(() => { adminListRoutes(adminKey).then(setRoutes).catch(() => {}); }, [adminKey]);
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.sm }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Las 11 rutas GPS</Text>
        <Text style={styles.cardSub}>Estas son las rutas que ven los clientes con acceso pagado. Las coordenadas y descripción están definidas en el código de la app para máxima estabilidad.</Text>
      </View>
      {routes.map((r) => (
        <View key={r.id} style={styles.routeCard}>
          <Text style={styles.routeName}>{r.name}</Text>
          <Text style={styles.routeMeta}>📍 {r.type === "urbana" ? "Urbana" : "Rural"} · {r.distance_km} km · {r.duration_min} min · {r.difficulty}</Text>
          <Text style={styles.routeMeta}>🗿 {r.pois_count} puntos de interés</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------- Contenido editable ----------
function ContentTab({ adminKey, collection, bottomInset }: { adminKey: string; collection: string; bottomInset: number }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editing, setEditing] = useState<Partial<ContentItem> | null>(null);

  const load = useCallback(() => {
    adminListContent(adminKey, collection).then((r) => setItems(r.items)).catch(() => {});
  }, [adminKey, collection]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing?.name) return;
    if (collection === "songs" && !editing.spotify_url) return;
    try {
      if (editing.id) await adminUpdateContent(adminKey, collection, editing.id, editing);
      else await adminCreateContent(adminKey, collection, editing);
      setEditing(null); load();
    } catch {}
  };
  const remove = (id: string) => {
    confirmAction(
      "¿Eliminar?",
      "Este elemento se borrará permanentemente.",
      "Eliminar",
      async () => {
        try {
          await adminDeleteContent(adminKey, collection, id);
          load();
        } catch (e) {
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.alert("No se pudo eliminar. Reintenta.");
          }
        }
      },
    );
  };

  const isSongs = collection === "songs";

  if (editing) {
    if (isSongs) {
      return (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.sm }}>
          <Text style={styles.cardTitle}>{editing.id ? "Editar canción" : "Agregar canción"}</Text>
          <Text style={styles.cardSub}>Configura una canción, episodio o playlist de Spotify que los clientes con acceso podrán escuchar.</Text>
          <Text style={styles.fieldLabel}>Título *</Text>
          <TextInput style={styles.input} placeholder="Título de la canción o episodio" value={editing.name || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, name: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
          <Text style={styles.fieldLabel}>Artista o autor</Text>
          <TextInput style={styles.input} placeholder="Ej: Podcast Rapa Nui" value={editing.artist || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, artist: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
          <Text style={styles.fieldLabel}>URL de Spotify *</Text>
          <TextInput style={styles.input} placeholder="https://open.spotify.com/track/…" value={editing.spotify_url || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, spotify_url: v }))} placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Descripción</Text>
          <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Descripción para el cliente" multiline value={editing.description || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, description: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
          <Pressable style={styles.grantBtn} onPress={save}><Text style={styles.grantBtnText}>{editing.id ? "Guardar cambios" : "Agregar canción"}</Text></Pressable>
          <Pressable onPress={() => setEditing(null)} style={{ alignSelf: "center", marginTop: spacing.md }}><Text style={styles.backLink}>Cancelar</Text></Pressable>
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.sm }}>
        <Text style={styles.cardTitle}>{editing.id ? "Editar" : "Agregar nuevo"}</Text>
        <TextInput style={styles.input} placeholder="Nombre *" value={editing.name || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, name: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
        <TextInput style={styles.input} placeholder="Teléfono" value={editing.phone || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, phone: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
        <TextInput style={styles.input} placeholder="WhatsApp" value={editing.whatsapp || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, whatsapp: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
        <TextInput style={styles.input} placeholder="Sitio web" value={editing.website || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, website: v }))} placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Dirección" value={editing.address || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, address: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
        {collection === "restaurants" && <TextInput style={styles.input} placeholder="Cocina (ej: Pizzería)" value={editing.cuisine || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, cuisine: v }))} placeholderTextColor={colors.onSurfaceTertiary} />}
        {collection === "emergencies" && <TextInput style={styles.input} placeholder="Categoría (Salud, Policía…)" value={editing.category || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, category: v }))} placeholderTextColor={colors.onSurfaceTertiary} />}
        <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Descripción" multiline value={editing.description || ""} onChangeText={(v) => setEditing((e) => ({ ...e!, description: v }))} placeholderTextColor={colors.onSurfaceTertiary} />
        <Pressable style={styles.grantBtn} onPress={save}><Text style={styles.grantBtnText}>Guardar</Text></Pressable>
        <Pressable onPress={() => setEditing(null)} style={{ alignSelf: "center", marginTop: spacing.md }}><Text style={styles.backLink}>Cancelar</Text></Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl, gap: spacing.sm }}>
      <Pressable style={styles.addBtn} onPress={() => setEditing({ name: "" })}>
        <Feather name="plus" size={16} color="#FFF" />
        <Text style={styles.addBtnText}>{isSongs ? "Agregar canción" : "Agregar nuevo"}</Text>
      </Pressable>
      {items.length === 0 && (
        <Text style={styles.empty}>Aún no hay {isSongs ? "canciones" : "elementos"} registrados.</Text>
      )}
      {items.map((it) => (
        <View key={it.id} style={styles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{it.name}</Text>
            {isSongs && it.artist && <Text style={styles.itemMeta}>🎤 {it.artist}</Text>}
            {isSongs && it.spotify_url && <Text style={styles.itemMeta} numberOfLines={1}>🎧 {it.spotify_url}</Text>}
            {!isSongs && it.phone && <Text style={styles.itemMeta}>📞 {it.phone}</Text>}
            {!isSongs && it.address && <Text style={styles.itemMeta}>📍 {it.address}</Text>}
            {!isSongs && it.category && <Text style={styles.itemMeta}>🔖 {it.category}</Text>}
          </View>
          <Pressable onPress={() => setEditing(it)} hitSlop={10}><Feather name="edit-2" size={16} color={colors.brand} /></Pressable>
          <Pressable onPress={() => remove(it.id)} hitSlop={10}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------- Seguridad ----------
function SeguridadTab({ adminKey, bottomInset, onKeyChanged }: { adminKey: string; bottomInset: number; onKeyChanged: (k: string) => void }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async () => {
    setMsg(null);
    if (nw.length < 6) { setMsg({ ok: false, text: "Mínimo 6 caracteres" }); return; }
    if (nw !== nw2) { setMsg({ ok: false, text: "Las claves no coinciden" }); return; }
    try {
      await adminChangePassword(adminKey, cur, nw);
      onKeyChanged(nw);
      await storage.setItem(ADMIN_KEY_STORAGE, nw);
      setMsg({ ok: true, text: "✓ Clave cambiada. Anótala en un lugar seguro." });
      setCur(""); setNw(""); setNw2("");
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Error" }); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cambiar clave del panel</Text>
        <Text style={styles.cardSub}>Cambia la clave que da acceso a este panel. Solo tú deberías conocerla. Mínimo 6 caracteres.</Text>
        <Text style={styles.fieldLabel}>Clave actual</Text>
        <TextInput style={styles.input} placeholder="Tu clave actual" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry value={cur} onChangeText={setCur} />
        <Text style={styles.fieldLabel}>Nueva clave</Text>
        <TextInput style={styles.input} placeholder="Nueva clave (mín. 6 caracteres)" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry value={nw} onChangeText={setNw} />
        <Text style={styles.fieldLabel}>Confirmar nueva clave</Text>
        <TextInput style={styles.input} placeholder="Repite la nueva clave" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry value={nw2} onChangeText={setNw2} />
        {msg && <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.error }]}>{msg.text}</Text>}
        <Pressable style={styles.grantBtn} onPress={submit}><Text style={styles.grantBtnText}>Cambiar clave</Text></Pressable>
        <Text style={styles.warn}>⚠️ Anota tu nueva clave en un lugar seguro. Si la olvidas, no hay forma de recuperarla desde la app.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  warningBanner: {
    alignSelf: "stretch",
    backgroundColor: "#B54B4B",
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: 8,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#8B2E2E",
    marginBottom: spacing.lg,
  },
  warningTitle: { fontFamily: serif, fontSize: 22, color: "#FFF", fontWeight: "900", letterSpacing: 1 },
  warningText: { color: "#FFF", fontSize: 14, textAlign: "center", lineHeight: 20, fontWeight: "700" },
  warningTextEn: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center", fontStyle: "italic", marginTop: 4 },
  keyInputWarning: { borderColor: "#B54B4B", borderWidth: 2 },
  destroyedScreen: {
    flex: 1,
    backgroundColor: "#B54B4B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  destroyedIconWrap: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
  destroyedTitle: { fontFamily: serif, fontSize: 30, color: "#FFF", fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  destroyedSub: { color: "rgba(255,255,255,0.9)", fontSize: 15, textAlign: "center" },
  destroyedBox: {
    alignSelf: "stretch",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: 4,
  },
  destroyedListTitle: { color: "#FFF", fontWeight: "800", fontSize: 14, marginBottom: 4 },
  destroyedItem: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 20 },
  destroyedFoot: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: spacing.lg },
  lockRow: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: spacing.md },
  keyInput: { alignSelf: "stretch", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, minHeight: 50, paddingHorizontal: spacing.md, fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  error: { color: colors.error, fontSize: 13 },
  hivamanaBtn: { alignSelf: "stretch", flexDirection: "row", gap: 8, backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 50, alignItems: "center", justifyContent: "center" },
  hivamanaText: { color: "#FFF", fontSize: 17, fontWeight: "800", letterSpacing: 1 },
  backLink: { color: colors.onSurfaceSecondary, fontSize: 13, textDecorationLine: "underline" },
  helpLink: { color: colors.brand, fontSize: 12, textDecorationLine: "underline", textAlign: "center" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },

  tabsBar: { backgroundColor: colors.surface, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0, maxHeight: 60 },
  tab: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  tabTextActive: { color: "#FFF" },

  totalCard: { backgroundColor: "#2B3A42", borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: 4 },
  totalLabel: { color: colors.warning, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  totalValue: { fontFamily: serif, fontSize: 36, color: "#FFF" },
  totalMetaText: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  grantedText: { color: colors.warning, fontSize: 12, marginTop: 4 },

  sectionTitle: { fontFamily: serif, fontSize: 18, color: colors.onSurface, marginTop: spacing.sm },
  empty: { color: colors.onSurfaceTertiary, fontSize: 13, fontStyle: "italic", textAlign: "center", paddingVertical: spacing.md },

  provRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  provName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  provCount: { fontSize: 12, color: colors.onSurfaceTertiary },
  provTotal: { fontSize: 14, fontWeight: "800", color: colors.success },

  saleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  saleAmount: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  saleMeta: { fontSize: 12, color: colors.onSurfaceTertiary },
  saleDate: { fontSize: 12, color: colors.onSurfaceTertiary },

  danger: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD9D9", backgroundColor: "#FFF5F5" },
  dangerTitle: { fontFamily: serif, fontSize: 16, color: colors.error, marginBottom: 4 },
  dangerText: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  dangerBtn: { flexDirection: "row", gap: 6, backgroundColor: "#B54B4B", borderRadius: radius.md, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  dangerBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  cardTitle: { fontFamily: serif, fontSize: 20, color: colors.onSurface },
  cardSub: { fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, marginTop: spacing.sm, letterSpacing: 1 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, minHeight: 46, paddingHorizontal: spacing.md, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },

  selectAll: { color: colors.brand, fontSize: 13, textDecorationLine: "underline", fontWeight: "700" },
  helperCount: { color: colors.brand, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  msgBox: {
    flexDirection: "row", gap: 8, alignItems: "center",
    padding: spacing.md, borderRadius: radius.md,
    marginTop: spacing.sm, borderWidth: 1,
  },
  msgBoxOk: { backgroundColor: "#E8F5E9", borderColor: colors.success },
  msgBoxErr: { backgroundColor: "#FFEBEE", borderColor: colors.error },
  msgBoxText: { flex: 1, fontSize: 13, fontWeight: "600" },
  checkRow: {
    flexDirection: "row", gap: 10, alignItems: "center",
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 48,
  },
  checkRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkName: { fontSize: 13, color: colors.onSurface, flex: 1 },
  checkPrice: { color: colors.onSurfaceTertiary },
  msg: { fontSize: 13, marginTop: spacing.sm },
  grantBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  grantBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  totalLine: { fontSize: 12, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.sm },
  revokeBtn: { flexDirection: "row", gap: 6, alignSelf: "center", alignItems: "center", marginTop: spacing.md, padding: 8 },
  revokeText: { color: colors.error, fontSize: 12, textDecorationLine: "underline" },

  routeCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 3 },
  routeName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  routeMeta: { fontSize: 12, color: colors.onSurfaceTertiary },

  addBtn: { flexDirection: "row", gap: 6, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  addBtnText: { color: "#FFF", fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  itemName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 12, color: colors.onSurfaceTertiary },

  warn: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: spacing.md, fontStyle: "italic" },
});
