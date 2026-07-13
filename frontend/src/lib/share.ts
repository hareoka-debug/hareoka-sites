import { Linking, Platform, Share } from "react-native";

// URL definitiva de producción de la app.
// Se compila en el bundle a partir de EXPO_PUBLIC_APP_URL (frontend/.env).
// Prioridad: EXPO_PUBLIC_APP_URL > window.location.origin (web) > EXPO_PUBLIC_BACKEND_URL.
function getAppUrl(): string {
  const publicUrl = (process.env.EXPO_PUBLIC_APP_URL || "").trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
}

const MESSAGE = (url: string) =>
  `\u{1F5FF} *Descubre Rapa Nui* \u2014 la gu\u00EDa con todas las rutas urbanas y rurales de Isla de Pascua: mo\u00E1is, playas, sitios arqueol\u00F3gicos y mapa GPS.\n\nCons\u00EDguela aqu\u00ED \u{1F449} ${url}`;

export async function shareGuideWhatsApp(): Promise<void> {
  const message = MESSAGE(getAppUrl());
  const encoded = encodeURIComponent(message);

  if (Platform.OS === "web") {
    // api.whatsapp.com directo: el redirect de wa.me corrompe los emojis
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
    return;
  }

  try {
    const waUrl = `whatsapp://send?text=${encoded}`;
    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
      return;
    }
  } catch {
    // WhatsApp no instalado: usar la hoja de compartir nativa
  }
  await Share.share({ message });
}
