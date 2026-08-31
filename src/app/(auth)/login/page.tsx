"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, AuthLink } from "@/components/auth/AuthCard";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { credentialsSchema } from "@/schemas/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    const { error: authError } = await supabase.auth.signInWithPassword(
      parsed.data,
    );
    setLoading(false);

    if (authError) {
      setError("Email ou senha incorretos.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <AuthCard
      title="Entrar no painel"
      footer={
        <>
          Não tem conta? <AuthLink href="/signup">Criar conta</AuthLink>
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
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
        <p className="text-center text-sm">
          <AuthLink href="/forgot-password">Esqueci minha senha</AuthLink>
        </p>
      </form>
    </AuthCard>
  );
}
