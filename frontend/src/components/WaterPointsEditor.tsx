import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  WaterPoint,
  WaterPointInput,
  addWaterPoint,
  deleteWaterPoint,
  fetchWaterPoints,
  updateWaterPoint,
} from "@/src/lib/api";
import { colors, radius, serif, spacing } from "@/src/lib/theme";

const SECTORS: { label: string; lat: number; lng: number }[] = [
  { label: "Hanga Roa centro", lat: -27.149, lng: -109.431 },
  { label: "Av. Atamu Tekena", lat: -27.1445, lng: -109.4295 },
  { label: "Tahai", lat: -27.1355, lng: -109.4265 },
  { label: "Mataveri", lat: -27.158, lng: -109.436 },
  { label: "Playa Anakena", lat: -27.0735, lng: -109.3235 },
  { label: "Rano Raraku", lat: -27.122, lng: -109.293 },
  { label: "Orongo / Rano Kau", lat: -27.177, lng: -109.434 },
];

interface Props {
  adminKey: string;
  bottomInset: number;
}

export default function WaterPointsEditor({ adminKey, bottomInset }: Props) {
  const [points, setPoints] = useState<WaterPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // formulario (crear o editar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState(SECTORS[0]);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPoints(await fetchWaterPoints());
      setError(null);
    } catch {
      setError("No se pudieron cargar los puntos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setSector(SECTORS[0]);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (p: WaterPoint) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description);
    const nearest = SECTORS.reduce((best, s) =>
      Math.hypot(s.lat - p.lat, s.lng - p.lng) < Math.hypot(best.lat - p.lat, best.lng - p.lng)
        ? s
        : best,
    );
    setSector({ ...nearest, lat: p.lat, lng: p.lng, label: nearest.label });
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Escribe el nombre del negocio.");
      return;
    }
    setSaving(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const data: WaterPointInput = {
      name: name.trim(),
      description: description.trim(),
      lat: sector.lat,
      lng: sector.lng,
    };
    try {
      if (editingId) {
        await updateWaterPoint(adminKey, editingId, data);
      } else {
        await addWaterPoint(adminKey, data);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await deleteWaterPoint(adminKey, id);
      setConfirmDeleteId(null);
      await load();
    } catch {
      setError("No se pudo eliminar.");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomInset + spacing.xxl }}>
      <Text style={styles.intro}>
        Estos son los puntos donde tus clientes pueden comprar agua VAINATIVA. Aparecen en el mapa
        (gota azul) y en el detalle de las rutas cercanas.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.addBtn} onPress={openCreate} testID="add-water-point">
        <Feather name="plus" size={16} color={colors.onBrand} />
        <Text style={styles.addBtnText}>Agregar negocio / punto de venta</Text>
      </Pressable>

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {editingId ? "Editar punto de venta" : "Nuevo punto de venta"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del negocio (ej: Almacén Moai)"
            placeholderTextColor={colors.onSurfaceTertiary}
            value={name}
            onChangeText={setName}
            testID="wp-name"
          />
          <TextInput
            style={[styles.input, { minHeight: 70 }]}
            placeholder="Descripción (ej: agua VAINATIVA fría, jugos y snacks)"
            placeholderTextColor={colors.onSurfaceTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            testID="wp-description"
          />
          <Text style={styles.sectorLabel}>Sector de la isla</Text>
          <View style={styles.sectors}>
            {SECTORS.map((s) => {
              const active = sector.label === s.label;
              return (
                <Pressable
                  key={s.label}
                  style={[styles.sectorPill, active && styles.sectorPillActive]}
                  onPress={() => setSector(s)}
                >
                  <Text style={[styles.sectorText, active && { color: colors.onBrand }]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving} testID="wp-save">
              {saving ? (
                <ActivityIndicator color={colors.onBrand} size="small" />
              ) : (
                <Text style={styles.saveText}>Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {points.map((p) => (
        <View key={p.id} style={styles.row} testID={`wp-row-${p.id}`}>
          <View style={styles.rowIcon}>
            <Feather name="droplet" size={14} color={colors.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{p.name}</Text>
            <Text style={styles.rowDesc} numberOfLines={2}>
              {p.description || "Sin descripción"}
            </Text>
          </View>
          {confirmDeleteId === p.id ? (
            <View style={styles.confirmBox}>
              <Pressable style={styles.confirmYes} onPress={() => handleDelete(p.id)} testID={`wp-confirm-delete-${p.id}`}>
                <Text style={styles.confirmYesText}>Eliminar</Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => setConfirmDeleteId(null)}>
                <Feather name="x" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable style={styles.iconBtn} onPress={() => openEdit(p)} testID={`wp-edit-${p.id}`}>
                <Feather name="edit-2" size={16} color={colors.info} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setConfirmDeleteId(p.id)}
                testID={`wp-delete-${p.id}`}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
              </Pressable>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl },
  intro: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceSecondary, marginBottom: spacing.lg },
  error: { color: colors.error, fontSize: 13, marginBottom: spacing.sm },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 48,
    marginBottom: spacing.lg,
  },
  addBtnText: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
  form: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  formTitle: { fontFamily: serif, fontSize: 18, color: colors.onSurface },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.onSurface,
  },
  sectorLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  sectors: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sectorPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    minHeight: 34,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  sectorPillActive: { backgroundColor: colors.info, borderColor: colors.info },
  sectorText: { fontSize: 12, color: colors.onSurfaceSecondary },
  formActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  saveBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rowDesc: { fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 16 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  confirmBox: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  confirmYes: {
    backgroundColor: colors.error,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: "center",
  },
  confirmYesText: { color: colors.onBrand, fontSize: 12, fontWeight: "700" },
});
