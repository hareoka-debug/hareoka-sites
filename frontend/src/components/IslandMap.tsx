import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import { Feather } from "@expo/vector-icons";

import { RouteData, WaterPoint } from "@/src/lib/api";
import { colors, poiColor, poiIcon } from "@/src/lib/theme";

interface Props {
  routes: RouteData[];
  waterPoints: WaterPoint[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}

export default function IslandMap({ routes, waterPoints, selectedRouteId, onSelectRoute, userLocation }: Props) {
  const selected = routes.find((r) => r.id === selectedRouteId) || null;
  const mapRef = useRef<MapView>(null);
  const centeredOnUser = useRef(false);

  useEffect(() => {
    if (userLocation && !centeredOnUser.current) {
      centeredOnUser.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        600,
      );
    }
    if (!userLocation) centeredOnUser.current = false;
  }, [userLocation]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialCamera={{
        center: { latitude: -27.125, longitude: -109.345 },
        pitch: 45,
        heading: 0,
        altitude: 22000,
        zoom: 12,
      }}
      mapType="hybrid"
      showsBuildings
      pitchEnabled
    >
      {routes.map((r) => (
        <Polyline
          key={r.id}
          coordinates={r.path.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
          strokeColor={r.color}
          strokeWidth={selectedRouteId === r.id ? 6 : 3}
          tappable
          onPress={() => onSelectRoute(r.id)}
        />
      ))}

      {waterPoints.map((w) => (
        <Marker
          key={w.id}
          coordinate={{ latitude: w.lat, longitude: w.lng }}
          title={w.name}
          description={w.description}
        >
          <View style={[styles.marker, { backgroundColor: colors.info }]}>
            <Feather name="droplet" size={12} color="#fff" />
          </View>
        </Marker>
      ))}

      {selected?.pois.map((p) => (
        <Marker
          key={`${selected.id}-${p.name}`}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          title={p.name}
          description={p.description}
        >
          <View style={[styles.marker, { backgroundColor: poiColor(p.type) }]}>
            <Feather name={poiIcon(p.type)} size={12} color="#fff" />
          </View>
        </Marker>
      ))}

      {userLocation ? (
        <Marker
          coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }}
          title="Tu ubicación"
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.userHalo}>
            <View style={styles.userDot} />
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(96,125,139,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.info,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
});
