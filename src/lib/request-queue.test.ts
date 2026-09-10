import { describe, expect, it } from "vitest";
import { createRequestQueue } from "./request-queue";

describe("fila de refetch do kanban", () => {
  it("aplica refetch incremental depois do completo sem respostas fora de ordem", async () => {
    const enqueue = createRequestQueue();
    const events: string[] = [];
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const all = enqueue(async () => { events.push("all-start"); await blocked; events.push("all-end"); });
    const one = enqueue(async () => { events.push("one"); });
    await Promise.resolve();
    expect(events).toEqual(["all-start"]);
    release();
    await Promise.all([all, one]);
    expect(events).toEqual(["all-start", "all-end", "one"]);
  });

  it("continua sincronizando depois de erro de rede", async () => {
    const enqueue = createRequestQueue();
    await expect(enqueue(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    let recovered = false;
    await enqueue(async () => { recovered = true; });
    expect(recovered).toBe(true);
  });
});
