import { notFound } from "next/navigation";
import { OrderStatusView } from "@/components/public/OrderStatus";
import { uuidSchema } from "@/schemas/common";

export const metadata = { title: "Acompanhar pedido" };

export default function OrderStatusPage({
  params,
}: {
  params: { orderId: string };
}) {
  if (!uuidSchema.safeParse(params.orderId).success) notFound();
  return <OrderStatusView orderId={params.orderId} />;
}
