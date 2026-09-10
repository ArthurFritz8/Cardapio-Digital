import { notFound } from "next/navigation";
import { PublicMenu } from "@/components/public/PublicMenu";
import { uuidSchema } from "@/schemas/common";

export const metadata = { title: "Cardápio" };

export default async function TableMenuPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  if (!uuidSchema.safeParse(tableId).success) notFound();
  return <PublicMenu key={tableId} tableId={tableId} />;
}
