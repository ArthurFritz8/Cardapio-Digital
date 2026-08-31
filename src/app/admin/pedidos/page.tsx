import { OrdersBoard } from "@/components/admin/OrdersBoard";
import { requireEstablishment } from "@/lib/admin/guard";

export const metadata = { title: "Pedidos" };

export default async function AdminOrdersPage() {
  const { establishment } = await requireEstablishment();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Pedidos</h1>
      <OrdersBoard establishmentId={establishment.id} />
    </div>
  );
}
