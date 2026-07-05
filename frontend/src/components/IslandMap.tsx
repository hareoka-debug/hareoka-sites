import React from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import { Feather } from "@expo/vector-icons";

import { RouteData, WaterPoint } from "@/src/lib/api";
import { colors, poiColor, poiIcon } from "@/src/lib/theme";

interface Props {
  routes: RouteData[];
  waterPoints: WaterPoint[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
}

export default function IslandMap({ routes, waterPoints, selectedRouteId, onSelectRoute }: Props) {
  const selected = routes.find((r) => r.id === selectedRouteId) || null;

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: -27.125,
        longitude: -109.345,
        latitudeDelta: 0.18,
        longitudeDelta: 0.3,
      }}
      mapType="standard"
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
});
