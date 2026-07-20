import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";

import { ContentListScreen } from "@/src/components/ContentListScreen";
import { ContentItem, checkAccessDetailed, fetchContent, getDeviceId } from "@/src/lib/api";

export default function AgenciesScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [locked, setLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancel = false;
      (async () => {
        setLoading(true);
        try {
          const dev = await getDeviceId();
          const acc = await checkAccessDetailed(dev);
          const has = acc.owned_products.includes("agencies");
          if (!has) {
            if (!cancel) setLocked(true);
            return;
          }
          const res = await fetchContent("agencies");
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
      title="Agencias de Tour"
      subtitle="Tour Agencies · Contacto directo"
      icon="briefcase"
      color="#2E86AB"
      loading={loading}
      locked={locked}
      items={items}
      showDisclaimer
    />
  );
}
