import { describe, expect, it } from "vitest";
import { haversineMeters, shouldRequireManualConfirmation } from "./geo";

// Praça da Sé (SP) como referência
const SE = { latitude: -23.5505, longitude: -46.6333 };

describe("haversineMeters", () => {
  it("retorna 0 para o mesmo ponto", () => {
    expect(haversineMeters(SE, SE)).toBe(0);
  });

  it("mede ~111m para 0.001 grau de latitude", () => {
    const nearby = { latitude: SE.latitude + 0.001, longitude: SE.longitude };
    const distance = haversineMeters(SE, nearby);
    expect(distance).toBeGreaterThan(105);
    expect(distance).toBeLessThan(118);
  });

  it("mede ~357km entre SP e Rio", () => {
    const cristo = { latitude: -22.9519, longitude: -43.2105 };
    const distance = haversineMeters(SE, cristo);
    expect(distance).toBeGreaterThan(340_000);
    expect(distance).toBeLessThan(380_000);
  });
});

describe("shouldRequireManualConfirmation", () => {
  const establishment = {
    latitude: SE.latitude,
    longitude: SE.longitude,
    order_radius_meters: 150,
  };

  it("nunca flagra quando estabelecimento não tem coordenadas", () => {
    const noGeo = { latitude: null, longitude: null, order_radius_meters: 150 };
    expect(shouldRequireManualConfirmation(noGeo, undefined)).toBe(false);
    expect(shouldRequireManualConfirmation(noGeo, SE)).toBe(false);
  });

  it("flagra quando cliente não compartilhou localização", () => {
    expect(shouldRequireManualConfirmation(establishment, undefined)).toBe(true);
  });

  it("não flagra cliente dentro do raio", () => {
    const inside = { latitude: SE.latitude + 0.0005, longitude: SE.longitude };
    expect(shouldRequireManualConfirmation(establishment, inside)).toBe(false);
  });

  it("flagra cliente fora do raio", () => {
    // ~1.1km de distância
    const outside = { latitude: SE.latitude + 0.01, longitude: SE.longitude };
    expect(shouldRequireManualConfirmation(establishment, outside)).toBe(true);
  });

  it("compensa imprecisão do GPS (indoor)", () => {
    // ~222m de distância, accuracy 80m => 142m efetivos <= raio 150m
    const indoor = {
      latitude: SE.latitude + 0.002,
      longitude: SE.longitude,
      accuracy: 80,
    };
    expect(shouldRequireManualConfirmation(establishment, indoor)).toBe(false);
  });

  it("cap na compensação impede bypass via accuracy spoofada", () => {
    // ~1.1km de distância, accuracy "mentirosa" de 100km
    const spoofed = {
      latitude: SE.latitude + 0.01,
      longitude: SE.longitude,
      accuracy: 100_000,
    };
    expect(shouldRequireManualConfirmation(establishment, spoofed)).toBe(true);
  });
});
