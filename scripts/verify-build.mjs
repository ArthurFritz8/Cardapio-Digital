// Smoke HTTP local do build, sem credenciais ou acesso Supabase.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise((resolve) => server.once("exit", resolve));
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Build não iniciou em 30 s.")), 30_000);
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.once("exit", () => { clearTimeout(timeout); reject(new Error("Servidor encerrou antes de iniciar.")); });
    let output = "";
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("Ready")) { clearTimeout(timeout); resolve(); }
    });
    // Drenar stderr sem imprimir dados que possam ser sensíveis de ambiente.
    server.stderr.resume();
  });
  const get = (path, options) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
  assert.equal((await get("/")).status, 200);
  const manifestResponse = await get("/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const response = await get(icon.src);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const sw = await get("/sw.js");
  assert.equal(sw.status, 200);
  assert.match(await sw.text(), /public-menu-pages-v1/);
  const cases = [
    ["/api/orders/invalid", undefined],
    ["/api/tables/invalid/session", { method: "POST" }],
    ["/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"price_cents":1}' }],
  ];
  for (const [path, options] of cases) {
    const response = await get(path, options);
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.js$/.test(entry.name)) {
        assert.doesNotMatch(await readFile(path, "utf8"), /SUPABASE_SERVICE_ROLE_KEY/, `Referência secreta no bundle cliente: ${path}`);
      }
    }
  }
  await inspect(".next/static");
  console.log("BUILD HTTP: home, manifest, 4 PNGs, SW e validação das 3 rotas aprovados; nenhum identificador service_role no JS cliente.");
} finally {
  server.kill();
  await exited;
}
