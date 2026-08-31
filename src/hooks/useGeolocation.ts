"use client";

import { useCallback, useState } from "react";
import { GEOLOCATION_TIMEOUT_MS } from "@/lib/constants";
import type { ClientLocation } from "@/lib/geo";

export type GeolocationStatus =
  | "idle"
  | "loading"
  | "granted"
  | "unavailable";

/**
 * Geolocalização com timeout e fallback gracioso: recusa, erro ou
 * demora além do timeout NUNCA bloqueiam o pedido — apenas resultam
 * em position=null (pedido seguirá flagrado p/ confirmação manual).
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [position, setPosition] = useState<ClientLocation | null>(null);

  const request = useCallback((): Promise<ClientLocation | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return Promise.resolve(null);
    }

    setStatus("loading");

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: ClientLocation | null) => {
        if (settled) return;
        settled = true;
        setPosition(result);
        setStatus(result ? "granted" : "unavailable");
        resolve(result);
      };

      // Guarda própria: alguns browsers ignoram options.timeout
      const timer = setTimeout(() => finish(null), GEOLOCATION_TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        {
          enableHighAccuracy: true,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: 60_000,
        },
      );
    });
  }, []);

  return { status, position, request };
}
