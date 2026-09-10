import { TablesManager } from "@/components/admin/TablesManager";
import { requireEstablishment } from "@/lib/admin/guard";
import type { Table } from "@/types/domain";
import { PUBLIC_TABLE_COLUMNS } from "@/lib/constants";

export const metadata = { title: "Mesas" };

export default async function MesasPage() {
  const { establishment, supabase } = await requireEstablishment();

  const { data: tables, error } = await supabase
    .from("tables")
    .select(PUBLIC_TABLE_COLUMNS)
    .eq("establishment_id", establishment.id)
    .order("created_at")
    .returns<Table[]>();

  if (error) throw new Error("Não foi possível carregar as mesas. Tente novamente.");

  return (
    <TablesManager establishmentId={establishment.id} tables={tables ?? []} />
  );
}
