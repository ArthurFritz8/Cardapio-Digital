/** Utilitários de dinheiro — valores SEMPRE em centavos (int). */

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 1990 -> "R$ 19,90" */
export function formatCents(cents: number): string {
  return BRL_FORMATTER.format(cents / 100);
}

/** "19,90" | "19.90" | "R$ 1.234,56" -> centavos (null se inválido) */
export function parseCents(input: string): number | null {
  const trimmed = input.replace(/R\$|\s/g, "");
  if (!trimmed) return null;
  // Com vírgula: formato pt-BR (pontos são separadores de milhar).
  // Sem vírgula: ponto é decimal ("19.90").
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
