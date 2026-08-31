import { MAX_GPS_ACCURACY_COMPENSATION_METERS } from "./constants";

/**
 * IMPORTANTE: geolocalização é TRIAGEM HEURÍSTICA contra o abuso casual
 * (foto do QR Code usada remotamente), NÃO é segurança — coordenadas
 * vêm do cliente e são spoofáveis. A defesa real é a confirmação
 * manual do garçom (needs_confirmation) + rate limit por mesa.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ClientLocation extends GeoPoint {
  /** Precisão reportada pelo GPS, em metros. */
  accuracy?: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Distância Haversine entre dois pontos, em metros. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

interface EstablishmentGeo {
  latitude: number | null;
  longitude: number | null;
  order_radius_meters: number;
}

/**
 * Decide se o pedido precisa de confirmação manual do garçom.
 * - Estabelecimento sem coordenadas => triagem desligada (nunca flagra).
 * - Cliente não compartilhou localização => flagra.
 * - Fora do raio (descontando a imprecisão do GPS, com cap) => flagra.
 */
export function shouldRequireManualConfirmation(
  establishment: EstablishmentGeo,
  client: ClientLocation | undefined,
): boolean {
  if (establishment.latitude == null || establishment.longitude == null) {
    return false;
  }
  if (!client) {
    return true;
  }

  const distance = haversineMeters(client, {
    latitude: establishment.latitude,
    longitude: establishment.longitude,
  });
  const compensation = Math.min(
    Math.max(client.accuracy ?? 0, 0),
    MAX_GPS_ACCURACY_COMPENSATION_METERS,
  );

  return distance - compensation > establishment.order_radius_meters;
}
