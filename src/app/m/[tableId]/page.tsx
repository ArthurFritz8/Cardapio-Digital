import { notFound } from "next/navigation";
import { PublicMenu } from "@/components/public/PublicMenu";
import { uuidSchema } from "@/schemas/common";

export const metadata = { title: "Cardápio" };

export default function TableMenuPage({
  params,
}: {
  params: { tableId: string };
}) {
  if (!uuidSchema.safeParse(params.tableId).success) notFound();
  return <PublicMenu tableId={params.tableId} />;
}
