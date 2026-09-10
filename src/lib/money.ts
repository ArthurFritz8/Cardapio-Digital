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
  const valid = trimmed.includes(",")
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(trimmed)
    : /^\d+(?:\.\d{1,2})?$/.test(trimmed);
  if (!valid) return null;
  // Com vírgula: formato pt-BR (pontos são separadores de milhar).
  // Sem vírgula: ponto é decimal ("19.90").
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
