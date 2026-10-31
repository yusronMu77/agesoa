import type { CapacitorConfig } from "@capacitor/cli";

// No `server.url` / `server.hostname`: the app is served from https://localhost inside the WebView, a secure
// context, so getUserMedia keeps working. Services must list https://localhost in CORS_ORIGINS.
const config: CapacitorConfig = {
  appId: "id.agesoa.witness",
  appName: "AGESOA Witness",
  webDir: "dist",
  android: { allowMixedContent: false },
  // The app is always light (color-scheme: light): dark status and navigation bar icons whatever the system theme.
  plugins: { SystemBars: { style: "LIGHT" } },
};

export default config;
