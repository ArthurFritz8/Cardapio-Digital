"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-10" role="alert">
      <h1 className="text-xl font-bold">Não foi possível carregar esta página</h1>
      <p>Confira sua conexão e tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </main>
  );
}
