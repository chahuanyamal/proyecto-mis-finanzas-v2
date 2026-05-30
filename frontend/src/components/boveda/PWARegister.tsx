"use client";

import { useEffect } from "react";

/**
 * Registra el service worker para soporte PWA (instalable + caché básica).
 * No-op en navegadores sin soporte o en desarrollo sin HTTPS/localhost.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro best-effort: ignorar fallos (p. ej. modo dev) */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
