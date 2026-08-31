import { UtensilsCrossed } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg">
        <UtensilsCrossed className="h-10 w-10" aria-hidden />
      </div>
      <h1 className="text-center text-3xl font-bold tracking-tight">
        Cardápio Digital
      </h1>
      <p className="max-w-md text-center text-neutral-600 dark:text-neutral-400">
        Escaneie o QR Code da sua mesa para ver o menu e fazer seu pedido —
        sem instalar nenhum aplicativo.
      </p>
    </main>
  );
}
