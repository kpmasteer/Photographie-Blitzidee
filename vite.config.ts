import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "logo-rechnung.png", "logo-rechnung.jpg"],
      manifest: {
        name: "Photographie Blitzidee Rechnungen",
        short_name: "Blitzidee",
        description: "Local-first Rechnungs- und Ausgabenverwaltung",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f4ef",
        theme_color: "#171412",
        lang: "de-DE",
        orientation: "any",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        runtimeCaching: []
      }
    })
  ]
});
