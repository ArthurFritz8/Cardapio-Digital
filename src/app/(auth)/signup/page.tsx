"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, AuthLink } from "@/components/auth/AuthCard";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { credentialsSchema } from "@/schemas/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setLoading(false);

    if (authError) {
      setError(
        authError.message.includes("already registered")
          ? "Este email já está cadastrado."
          : "Não foi possível criar a conta. Tente novamente.",
      );
      return;
    }

    // Sessão presente = confirmação de email desativada no projeto
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }
    setAwaitingConfirmation(true);
  }

  if (awaitingConfirmation) {
    return (
      <AuthCard title="Confirme seu email">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Enviamos um link de confirmação para <strong>{email}</strong>.
          Abra o email e clique no link para ativar sua conta.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      footer={
        <>
          Já tem conta? <AuthLink href="/login">Entrar</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Senha (mín. 8 caracteres)</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Criando..." : "Criar conta"}
        </Button>
      </form>
    </AuthCard>
  );
}
