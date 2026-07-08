// Versión web del mapa: imagen satelital real de Rapa Nui (ESRI World Imagery,
// proyección EPSG:4326 que calza con la proyección lineal usada abajo) con las
// rutas y marcadores superpuestos en SVG interactivo.
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Image as SvgImage,
  Polyline,
  Circle,
  Text as SvgText,
  G,
  Rect,
} from "react-native-svg";

import { RouteData, WaterPoint } from "@/src/lib/api";
import { colors, poiColor } from "@/src/lib/theme";

interface Props {
  routes: RouteData[];
  waterPoints: WaterPoint[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const W = 1000;
const H = 720;
const LON_MIN = -109.49;
const LON_MAX = -109.2;
const LAT_TOP = -27.02;
const LAT_BOTTOM = -27.22;

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
  `?bbox=${LON_MIN},${LAT_BOTTOM},${LON_MAX},${LAT_TOP}` +
  `&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;

const px = (lng: number) => ((lng - LON_MIN) / (LON_MAX - LON_MIN)) * W;
const py = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

const isOnIsland = (lat: number, lng: number) =>
  lat <= LAT_TOP && lat >= LAT_BOTTOM && lng >= LON_MIN && lng <= LON_MAX;

export default function IslandMap({ routes, waterPoints, selectedRouteId, onSelectRoute, userLocation }: Props) {
  const selected = routes.find((r) => r.id === selectedRouteId) || null;

  return (
    <View style={styles.container}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet">
        <Rect x={0} y={0} width={W} height={H} fill="#12222B" />
        <SvgImage
          href={{ uri: SATELLITE_URL }}
          x={0}
          y={0}
          width={W}
          height={H}
          preserveAspectRatio="none"
        />

        {routes.map((r) => {
          const pts = r.path.map(([lat, lng]) => `${px(lng)},${py(lat)}`).join(" ");
          const isSel = selectedRouteId === r.id;
          return (
            <G key={r.id}>
              {/* halo blanco para contraste sobre el satélite */}
              <Polyline
                points={pts}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={isSel ? 11 : 7}
                strokeOpacity={selectedRouteId && !isSel ? 0.25 : 0.85}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Polyline
                points={pts}
                fill="none"
                stroke={r.color}
                strokeWidth={isSel ? 7 : 4}
                strokeOpacity={selectedRouteId && !isSel ? 0.45 : 1}
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
              fontWeight="700"
              fill="#FFFFFF"
              stroke="#12222B"
              strokeWidth={0.8}
              textAnchor="middle"
            >
              {p.name}
            </SvgText>
          </G>
        ))}

        {userLocation && isOnIsland(userLocation.lat, userLocation.lng) ? (
          <G>
            <Circle
              cx={px(userLocation.lng)}
              cy={py(userLocation.lat)}
              r={16}
              fill="#5FB6E8"
              fillOpacity={0.3}
            />
            <Circle
              cx={px(userLocation.lng)}
              cy={py(userLocation.lat)}
              r={7}
              fill="#5FB6E8"
              stroke="#fff"
              strokeWidth={2.5}
            />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#12222B",
    alignItems: "center",
    justifyContent: "center",
  },
});
