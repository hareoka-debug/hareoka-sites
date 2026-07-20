import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";

import { ContentListScreen } from "@/src/components/ContentListScreen";
import { ContentItem, fetchContent } from "@/src/lib/api";

export default function EmergenciesScreen() {
  // Emergencias es GRATIS — no requiere verificación
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ContentItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancel = false;
      (async () => {
        setLoading(true);
        try {
          const res = await fetchContent("emergencies");
          if (!cancel) setItems(res.items);
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

  return (
    <ContentListScreen
      title="Emergencias"
      subtitle="Acceso gratuito · 24/7"
      icon="alert-triangle"
      color="#DC2626"
      loading={loading}
      items={items}
    />
  );
}
