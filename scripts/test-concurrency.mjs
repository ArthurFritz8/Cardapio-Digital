import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [bin, port, database] = process.argv.slice(2);
if (!bin || !/^\d+$/.test(port ?? "") || database !== "cardapio_audit_tests") {
  throw new Error("Execute exclusivamente pelo harness test-migrations.ps1.");
}
function sql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(bin, "psql.exe"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database], { windowsHide: true });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(query);
  });
}
const owner = "a0061111-1111-4111-8111-111111111111";
const table = "00000000-0000-4000-a000-000000000030";
const item = "00000000-0000-4000-a000-000000000020";
await sql(`insert into auth.users(id,email_confirmed_at) values ('${owner}',now());`);
const seed = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
await assert.rejects(sql(seed), /SEED_OWNER_REQUIRED/);
assert.match(seed, /v_owner uuid := null;/);
const configuredSeed = seed.replace("v_owner uuid := null;", `v_owner uuid := '${owner}';`);
await sql(configuredSeed);
await sql(`update public.menu_items set price_cents=1350 where id='${item}';`);
await sql(configuredSeed);
assert.equal(await sql(`select price_cents from public.menu_items where id='${item}';`), "1350");
assert.equal(await sql("select count(*) from public.tables;"), "3");
console.log("SEED: escolha obrigatória, execução real e reexecução sem sobrescrever dados aprovadas.");

const sessions = await Promise.all(Array.from({ length: 12 }, () => sql(`set role service_role; select session_token from public.start_table_session('${table}');`)));
assert.equal(new Set(sessions).size, 1, "scans concorrentes devem compartilhar sessão");
const token = sessions[0];
const create = (id) => sql(`set role service_role; select public.create_order('${table}','${token}','[{"menu_item_id":"${item}","quantity":2}]',null,null,false,5,'${id}')->>'id';`);
const distinct = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => create(`a0062222-2222-4222-8222-${String(i).padStart(12,"0")}`)));
assert.equal(distinct.filter((result) => result.status === "fulfilled").length, 5);
for (const result of distinct.filter((r) => r.status === "rejected")) assert.match(result.reason.message, /TABLE_ORDER_LIMIT/);
assert.equal(await sql(`select count(*) from public.orders where table_id='${table}';`), "5");
await sql(`update public.orders set status='cancelled' where table_id='${table}';`);
const replay = await Promise.all(Array.from({ length: 12 }, () => create("a0063333-3333-4333-8333-333333333333")));
assert.equal(new Set(replay).size, 1, "retry concorrente não pode duplicar pedido");
assert.equal(await sql(`select count(*) from public.orders where table_id='${table}' and status='pending';`), "1");
assert.equal(await sql("select count(*) from public.orders o where total_cents <> (select sum(unit_price_cents::bigint*quantity) from public.order_items where order_id=o.id);"), "0");
const quota = await Promise.all(Array.from({ length: 20 }, () => sql("set role service_role; select public.consume_ip_rate_limit(repeat('c',64),'orders',7,60);")));
assert.equal(quota.filter((result) => result === "t").length, 7);
assert.equal(quota.filter((result) => result === "f").length, 13);
console.log("CONCORRÊNCIA: 12 scans/1 token; 12 pedidos/5 aceitos; 12 retries/1 pedido; 20 requisições IP/7 aceitas; snapshots consistentes.");
