import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { requireEstablishment } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "Painel" };

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { establishment } = await requireEstablishment();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <h1 className="truncate text-base font-bold">{establishment.name}</h1>
          <LogoutButton />
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-2">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
