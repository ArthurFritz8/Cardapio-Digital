import { redirect } from "next/navigation";
import { EstablishmentForm } from "@/components/admin/EstablishmentForm";
import { getOwnerContext } from "@/lib/admin/guard";

export const metadata = { title: "Criar estabelecimento" };

export default async function OnboardingPage() {
  const { establishment } = await getOwnerContext();
  if (establishment) redirect("/admin");

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">Bem-vindo!</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        Cadastre seu estabelecimento para começar a montar o cardápio.
      </p>
      <EstablishmentForm mode="create" />
    </main>
  );
}
