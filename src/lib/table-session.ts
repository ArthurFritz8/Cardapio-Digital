/**
 * Persistência client-side da sessão de mesa (localStorage) para não
 * repetir o fluxo de sessão a cada reload dentro da janela de validade.
 * A validade REAL é sempre checada no servidor (create_order).
 */

export interface StoredTableSession {
  token: string;
  expiresAt: string;
}

const storageKey = (tableId: string) => `cd.table-session.${tableId}`;

export function loadTableSession(tableId: string): StoredTableSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<StoredTableSession>;
    if (
      typeof session.token !== "string" ||
      typeof session.expiresAt !== "string" ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      window.localStorage.removeItem(storageKey(tableId));
      return null;
    }
    return { token: session.token, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export function saveTableSession(
  tableId: string,
  session: StoredTableSession,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(session));
  } catch {
    // localStorage cheio/bloqueado — sessão será renovada via API
  }
}

export function clearTableSession(tableId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(tableId));
  } catch {
    // noop
  }
}
