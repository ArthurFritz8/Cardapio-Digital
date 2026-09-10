/** Retém somente destinos internos, inclusive contra barras invertidas/controles. */
export function safeAuthRedirect(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020]/.test(next)) return "/admin";
  return next;
}
