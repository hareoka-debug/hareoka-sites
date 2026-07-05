// Versión web del mapa: la isla se dibuja como SVG interactivo
// (react-native-maps no funciona en web).
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Polygon, Polyline, Circle, Text as SvgText, G } from "react-native-svg";

import { RouteData, WaterPoint } from "@/src/lib/api";
import { colors, poiColor } from "@/src/lib/theme";

interface Props {
  routes: RouteData[];
  waterPoints: WaterPoint[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
}

const W = 1000;
const H = 720;
const LON_MIN = -109.49;
const LON_MAX = -109.2;
const LAT_TOP = -27.02;
const LAT_BOTTOM = -27.22;

const px = (lng: number) => ((lng - LON_MIN) / (LON_MAX - LON_MIN)) * W;
const py = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

// Contorno aproximado (triangular) de Rapa Nui
const ISLAND: [number, number][] = [
  [-27.055, -109.375],
  [-27.062, -109.345],
  [-27.07, -109.325],
  [-27.078, -109.295],
  [-27.08, -109.27],
  [-27.088, -109.24],
  [-27.095, -109.225],
  [-27.11, -109.23],
  [-27.125, -109.25],
  [-27.135, -109.27],
  [-27.145, -109.3],
  [-27.155, -109.33],
  [-27.165, -109.36],
  [-27.178, -109.4],
  [-27.2, -109.435],
  [-27.19, -109.452],
  [-27.175, -109.455],
  [-27.155, -109.446],
  [-27.14, -109.436],
  [-27.12, -109.442],
  [-27.1, -109.443],
  [-27.08, -109.428],
  [-27.065, -109.408],
];

const islandPoints = ISLAND.map(([lat, lng]) => `${px(lng)},${py(lat)}`).join(" ");

export default function IslandMap({ routes, waterPoints, selectedRouteId, onSelectRoute }: Props) {
  const selected = routes.find((r) => r.id === selectedRouteId) || null;

  return (
    <View style={styles.container}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <Polygon points={islandPoints} fill="#EFEAE0" stroke={colors.borderStrong} strokeWidth={3} />

        {routes.map((r) => {
          const pts = r.path.map(([lat, lng]) => `${px(lng)},${py(lat)}`).join(" ");
          const isSel = selectedRouteId === r.id;
          return (
            <G key={r.id}>
              <Polyline
                points={pts}
                fill="none"
                stroke={r.color}
                strokeWidth={isSel ? 8 : 4}
                strokeOpacity={selectedRouteId && !isSel ? 0.35 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* línea invisible más ancha para facilitar el toque */}
              <Polyline
                points={pts}
                fill="none"
                stroke="#000"
                strokeOpacity={0.001}
                strokeWidth={26}
                onPress={() => onSelectRoute(r.id)}
              />
            </G>
          );
        })}

        {waterPoints.map((w) => (
          <G key={w.id}>
            <Circle cx={px(w.lng)} cy={py(w.lat)} r={9} fill={colors.info} stroke="#fff" strokeWidth={2} />
            <SvgText
              x={px(w.lng)}
              y={py(w.lat) + 3.5}
              fontSize={10}
              fontWeight="bold"
              fill="#fff"
              textAnchor="middle"
            >
              V
            </SvgText>
          </G>
        ))}

        {selected?.pois.map((p) => (
          <G key={`${selected.id}-${p.name}`}>
            <Circle cx={px(p.lng)} cy={py(p.lat)} r={10} fill={poiColor(p.type)} stroke="#fff" strokeWidth={2.5} />
            <SvgText
              x={px(p.lng)}
              y={py(p.lat) - 16}
              fontSize={15}
              fontWeight="600"
              fill={colors.onSurface}
              textAnchor="middle"
            >
              {p.name}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#DCE4E7",
    alignItems: "center",
    justifyContent: "center",
  },
});
