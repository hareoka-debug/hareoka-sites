import { useEffect } from "react";
import { useRouter } from "expo-router";

// Pantalla eliminada; redirigimos al hub.
export default function Deprecated() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
