// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" style={{ height: "100%" }} translate="no" className="notranslate">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Prevenir traducción automática del navegador (evita "Fluir" en vez de "Flow") */}
        <meta name="google" content="notranslate" />
        <meta name="robots" content="notranslate" />
        <title>Descubre Rapa Nui</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { -webkit-text-size-adjust: 100%; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              /* Google Translate ignora estos elementos */
              .notranslate { -webkit-user-select: text; }
              [data-notranslate="true"] { -webkit-user-select: text; }
            `,
          }}
        />
      </head>
      <body
        className="notranslate"
        translate="no"
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

