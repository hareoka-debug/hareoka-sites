import React from "react";
import { ContentListScreen } from "@/src/components/ContentListScreen";

export default function Emergencies() {
  return (
    <ContentListScreen
      config={{
        collection: "emergencies",
        productId: "emergencies",
        titleEs: "Emergencias",
        titleEn: "Emergencies",
        subtitle: "Acceso gratuito · 24/7",
        requiresPayment: false,
      }}
    />
  );
}
