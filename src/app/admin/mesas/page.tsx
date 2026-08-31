import { TablesManager } from "@/components/admin/TablesManager";
import { requireEstablishment } from "@/lib/admin/guard";
import type { Table } from "@/types/domain";

export const metadata = { title: "Mesas" };

export default async function MesasPage() {
  const { establishment, supabase } = await requireEstablishment();

  const { data: tables } = await supabase
    .from("tables")
    .select("*")
    .eq("establishment_id", establishment.id)
    .order("created_at")
    .returns<Table[]>();

  return (
    <TablesManager establishmentId={establishment.id} tables={tables ?? []} />
  );
}
