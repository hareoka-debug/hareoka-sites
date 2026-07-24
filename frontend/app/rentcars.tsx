import React from "react";
import { ContentListScreen } from "@/src/components/ContentListScreen";

export default function RentCars() {
  return (
    <ContentListScreen
      config={{
        collection: "rentcars",
        productId: "rentcars",
        titleEs: "Rent a Car",
        titleEn: "Rent a Car",
        requiresPayment: true,
      }}
    />
  );
}
