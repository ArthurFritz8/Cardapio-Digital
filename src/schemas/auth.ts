import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z
    .string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .max(72, "Senha longa demais"),
});

export const emailSchema = credentialsSchema.pick({ email: true });

export type CredentialsInput = z.infer<typeof credentialsSchema>;
