"use client";

import { Download, Eye, EyeOff, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from "qrcode";
import { Button, cn, ErrorText, Input } from "@/components/ui";
import { getClientEnv } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { tableSchema } from "@/schemas/menu";
import type { Table } from "@/types/domain";

interface TablesManagerProps {
  establishmentId: string;
  tables: Table[];
}

/**
 * O QR Code aponta para /m/{table_id} (uuid ESTÁVEL). O session_token
 * é rotativo (TTL 2h) e obtido no scan — nunca vai impresso no QR.
 */
function tableUrl(tableId: string): string {
  return `${getClientEnv().NEXT_PUBLIC_APP_URL}/m/${tableId}`;
}

async function downloadQrCode(table: Table) {
  const dataUrl = await QRCode.toDataURL(tableUrl(table.id), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = `qrcode-${table.label.replace(/\s+/g, "-").toLowerCase()}.png`;
  anchor.click();
}

export function TablesManager({ establishmentId, tables }: TablesManagerProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addTable() {
    setError(null);
    const parsed = tableSchema.safeParse({
      establishment_id: establishmentId,
      label: newLabel,
    });
    if (!parsed.success) {
      setError("Identificação inválida (1 a 30 caracteres). Ex: Mesa 1");
      return;
    }
    const { error: e } = await supabase.from("tables").insert(parsed.data);
    if (e) {
      setError(
        e.code === "23505" ? "Já existe uma mesa com essa identificação." : e.message,
      );
      return;
    }
    setNewLabel("");
    router.refresh();
  }

  async function toggleTable(table: Table) {
    setError(null);
    const { error: e } = await supabase
      .from("tables")
      .update({ is_active: !table.is_active })
      .eq("id", table.id);
    if (e) {
      setError(e.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Nova mesa (ex: Mesa 1, Balcão)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTable())}
        />
        <Button onClick={addTable} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Mesa
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {tables.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          Cadastre as mesas do seu bar. Cada mesa ganha um QR Code para
          imprimir e colar na mesa.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tables.map((table) => (
            <li
              key={table.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800",
                !table.is_active && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{table.label}</p>
                <p className="text-xs text-neutral-500">
                  {table.is_active ? "Ativa" : "Desativada (não aceita pedidos)"}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => downloadQrCode(table)}
                title="Baixar QR Code para impressão"
              >
                <Download className="h-4 w-4" aria-hidden />
                QR
              </Button>
              <button
                aria-label={table.is_active ? "Desativar mesa" : "Reativar mesa"}
                title={table.is_active ? "Desativar mesa" : "Reativar mesa"}
                onClick={() => toggleTable(table)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {table.is_active ? (
                  <Eye className="h-4 w-4" aria-hidden />
                ) : (
                  <EyeOff className="h-4 w-4" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
