"use client";

import { useState } from "react";
import { AuthCard, AuthLink } from "@/components/auth/AuthCard";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { emailSchema } from "@/schemas/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse({ email });
    if (!parsed.success) {
      setError("Email inválido");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    // Sempre exibe sucesso (anti user-enumeration)
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Verifique seu email">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Se existir uma conta para <strong>{email}</strong>, você receberá um
          link para redefinir a senha.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recuperar senha"
      footer={<AuthLink href="/login">Voltar para o login</AuthLink>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email cadastrado</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Enviando..." : "Enviar link"}
        </Button>
      </form>
    </AuthCard>
  );
}
