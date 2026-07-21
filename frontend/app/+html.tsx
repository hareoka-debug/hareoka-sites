// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* ---- SEO & App identity ---- */}
        <title>Descubre Rapa Nui — Guía de senderos de Isla de Pascua</title>
        <meta
          name="description"
          content="La guía definitiva de senderos, rutas y sitios arqueológicos de Isla de Pascua (Rapa Nui). Mapa GPS, moáis, playas y puntos de agua."
        />
        <meta name="application-name" content="Descubre Rapa Nui" />
        <meta name="apple-mobile-web-app-title" content="Descubre Rapa Nui" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#B35D4A" />

        {/* ---- Open Graph (WhatsApp, Facebook, etc.) ---- */}
        <meta property="og:title" content="Descubre Rapa Nui" />
        <meta
          property="og:description"
          content="La guía completa de senderos y sitios arqueológicos de Isla de Pascua. Mapa GPS con moáis, playas y puntos de agua."
        />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="es_CL" />

        {/* ---- Twitter Card ---- */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Descubre Rapa Nui" />
        <meta
          name="twitter:description"
          content="La guía de senderos y sitios arqueológicos de Isla de Pascua."
        />

        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              /* Safe-area padding para iOS Safari (barra inferior) */
              body > div:first-child { padding-bottom: env(safe-area-inset-bottom) !important; padding-top: env(safe-area-inset-top) !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
