/** Utilitários de dinheiro — valores SEMPRE em centavos (int). */

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 1990 -> "R$ 19,90" */
export function formatCents(cents: number): string {
  return BRL_FORMATTER.format(cents / 100);
}

/** "19,90" | "19.90" -> 1990 (retorna null se inválido) */
export function parseCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
