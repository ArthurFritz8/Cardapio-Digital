import { z } from "zod";

/** Schemas compartilhados front + back (single source of truth). */

export const uuidSchema = z.string().uuid("ID inválido");

export const slugSchema = z
  .string()
  .min(3, "Mínimo de 3 caracteres")
  .max(50, "Máximo de 50 caracteres")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use apenas letras minúsculas, números e hífens",
  );

/** Preço sempre em centavos (inteiro) — nunca float para dinheiro. */
export const priceCentsSchema = z
  .number()
  .int("Preço deve ser inteiro (centavos)")
  .min(0, "Preço não pode ser negativo")
  .max(10_000_000, "Preço acima do limite permitido");
