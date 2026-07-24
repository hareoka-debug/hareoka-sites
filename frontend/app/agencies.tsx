import React from "react";
import { ContentListScreen } from "@/src/components/ContentListScreen";

export default function Agencies() {
  return (
    <ContentListScreen
      config={{
        collection: "agencies",
        productId: "agencies",
        titleEs: "Agencias de Tour",
        titleEn: "Tour Agencies",
        requiresPayment: true,
      }}
    />
  );
}
