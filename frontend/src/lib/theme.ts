import { Platform } from "react-native";

export const colors = {
  surface: "#F9F8F6",
  onSurface: "#2B3A42",
  surfaceSecondary: "#F2F0EB",
  onSurfaceSecondary: "#3D4E56",
  surfaceTertiary: "#E8E5DF",
  onSurfaceTertiary: "#4F636C",
  surfaceInverse: "#2B3A42",
  onSurfaceInverse: "#F9F8F6",
  brand: "#B35D4A",
  onBrand: "#FFFFFF",
  brandSecondary: "#8A4A3B",
  brandTertiary: "#E6D5CF",
  onBrandTertiary: "#8A4A3B",
  success: "#4A6B53",
  warning: "#D4A373",
  error: "#9E4747",
  info: "#607D8B",
  border: "#E8E5DF",
  borderStrong: "#D1CCC2",
};

export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, serif",
});

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const difficultyColor = (d: string) =>
  d === "Fácil" ? colors.success : d === "Moderada" ? colors.warning : colors.error;

export const poiIcon = (type: string): any => {
  switch (type) {
    case "moai":
      return "octagon";
    case "playa":
      return "umbrella";
    case "arqueologico":
      return "flag";
    case "mirador":
      return "eye";
    case "cueva":
      return "moon";
    default:
      return "map-pin";
  }
};

export const poiColor = (type: string) => {
  switch (type) {
    case "moai":
      return colors.brandSecondary;
    case "playa":
      return colors.warning;
    case "arqueologico":
      return colors.brand;
    case "mirador":
      return colors.info;
    case "cueva":
      return colors.onSurface;
    default:
      return colors.brand;
  }
};
