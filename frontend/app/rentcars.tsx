import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";

import { ContentListScreen } from "@/src/components/ContentListScreen";
import { ContentItem, checkAccessDetailed, fetchContent, getDeviceId } from "@/src/lib/api";

export default function RentcarsScreen() {
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
          if (!acc.owned_products.includes("rentcars")) {
            if (!cancel) setLocked(true);
            return;
          }
          const res = await fetchContent("rentcars");
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
      title="Rent a Car"
      subtitle="Vehicle rentals · Arriendos"
      icon="truck"
      color="#F4A261"
      loading={loading}
      locked={locked}
      items={items}
      showDisclaimer
    />
  );
}
