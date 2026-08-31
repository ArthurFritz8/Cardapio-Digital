import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Establishment } from "@/types/domain";

/**
 * Guard SERVER-SIDE (sem flash de conteúdo não autorizado nem fetch
 * duplicado — React.cache deduplica por request). MVP: 1 establishment
 * por dono (o primeiro); multi-loja fica para ADR futuro.
 */
export const getOwnerContext = cache(async () => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<Establishment>();

  return { user, establishment: establishment ?? null, supabase };
});

export async function requireEstablishment() {
  const ctx = await getOwnerContext();
  if (!ctx.establishment) redirect("/onboarding");
  return {
    user: ctx.user,
    establishment: ctx.establishment,
    supabase: ctx.supabase,
  };
}
