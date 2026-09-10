import { notFound } from "next/navigation";
import { OrderStatusView } from "@/components/public/OrderStatus";
import { uuidSchema } from "@/schemas/common";

export const metadata = { title: "Acompanhar pedido" };

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!uuidSchema.safeParse(orderId).success) notFound();
  return <OrderStatusView key={orderId} orderId={orderId} />;
}
