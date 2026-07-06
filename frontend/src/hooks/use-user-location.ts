import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

export interface UserCoords {
  lat: number;
  lng: number;
}

export type LocationStartResult = "ok" | "denied" | "blocked" | "error";

export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [tracking, setTracking] = useState(false);
  const [acquiring, setAcquiring] = useState(false);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const stop = () => {
    subRef.current?.remove();
    subRef.current = null;
    setTracking(false);
    setCoords(null);
  };

  const start = async (): Promise<LocationStartResult> => {
    setAcquiring(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        if (perm.status === "denied" && !perm.canAskAgain) return "blocked";
        perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return perm.canAskAgain ? "denied" : "blocked";
      }
      subRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
      );
      setTracking(true);
      return "ok";
    } catch {
      return "error";
    } finally {
      setAcquiring(false);
    }
  };

  useEffect(() => {
    return () => {
      subRef.current?.remove();
    };
  }, []);

  return { coords, tracking, acquiring, start, stop };
}
