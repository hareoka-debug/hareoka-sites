import React from "react";
import { ContentListScreen } from "@/src/components/ContentListScreen";

export default function Restaurants() {
  return (
    <ContentListScreen
      config={{
        collection: "restaurants",
        productId: "restaurants",
        titleEs: "Restaurantes",
        titleEn: "Restaurants",
        requiresPayment: true,
      }}
    />
  );
}
