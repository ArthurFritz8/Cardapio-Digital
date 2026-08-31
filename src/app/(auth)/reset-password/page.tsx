"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, AuthLink } from "@/components/auth/AuthCard";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Senha deve ter no mínimo 8 caracteres");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(
        "Não foi possível redefinir. O link pode ter expirado — solicite um novo.",
      );
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <AuthCard
      title="Nova senha"
      footer={<AuthLink href="/forgot-password">Solicitar novo link</AuthLink>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">Nova senha (mín. 8 caracteres)</Label>
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
          {loading ? "Salvando..." : "Redefinir senha"}
        </Button>
      </form>
    </AuthCard>
  );
}
