import { EstablishmentForm } from "@/components/admin/EstablishmentForm";
import { requireEstablishment } from "@/lib/admin/guard";

export const metadata = { title: "Estabelecimento" };

export default async function EstablishmentPage() {
  const { establishment } = await requireEstablishment();

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-lg font-bold">Dados do estabelecimento</h2>
      <EstablishmentForm mode="edit" initial={establishment} />
    </div>
  );
}
