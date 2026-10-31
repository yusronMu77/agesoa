import { Capacitor } from "@capacitor/core";

/** True inside the Android app (Capacitor WebView), false in a browser or PWA. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
