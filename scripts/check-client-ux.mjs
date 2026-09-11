// QA em navegador real com fixtures locais. Não acessa nem altera Supabase.
// Requer build e Playwright externo (PLAYWRIGHT_MODULE_PATH opcional).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise((resolve) => server.once("exit", resolve));
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Servidor não iniciou em 30 s")), 30_000);
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.once("exit", () => { clearTimeout(timeout); reject(new Error("Servidor encerrou antes de iniciar")); });
    let output = "";
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("Ready")) { clearTimeout(timeout); resolve(); }
    });
    server.stderr.resume();
  });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  // Este roteiro testa UI com APIs interceptadas; SW tem suíte própria.
  // Simula navegador sem suporte para não iniciar Workbox sobre um registro bloqueado.
  await context.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const tableId = "11111111-1111-4111-8111-111111111111";
  const establishmentId = "22222222-2222-4222-8222-222222222222";
  const categoryId = "33333333-3333-4333-8333-333333333333";
  const itemId = "44444444-4444-4444-8444-444444444444";
  const orderId = "55555555-5555-4555-8555-555555555555";
  const otherTableId = "66666666-6666-4666-8666-666666666666";
  const now = new Date().toISOString();
  const menu = {
    table: { id: tableId, label: "Mesa QA" },
    establishment: { id: establishmentId, name: "Cardápio QA", description: null, logo_url: null, is_open: true },
    categories: [{ id: categoryId, establishment_id: establishmentId, name: "Refeições", sort_order: 0, is_active: true, created_at: now }],
    items: [{ id: itemId, establishment_id: establishmentId, category_id: categoryId, name: "Porção de camarão", description: "Com limão", price_cents: 1990, is_available: true, sort_order: 0, image_url: null, created_at: now, updated_at: now }],
  };
  let posts = 0;
  let releasePost;
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Bloqueia inclusive URLs públicas de um eventual .env do desenvolvedor.
    if (url.origin !== origin) return route.abort();
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { session: { session_token: establishmentId, session_expires_at: new Date(Date.now() + 3_600_000).toISOString() } } });
    if (url.pathname === "/api/orders") {
      posts++;
      const payload = request.postDataJSON();
      assert.equal(payload.items[0].menu_item_id, itemId);
      assert.equal(payload.items[0].quantity, 1);
      assert.equal(payload.items[0].price_cents, undefined);
      assert.equal(payload.items[0].name, undefined);
      assert.match(payload.request_id, /^[0-9a-f-]{36}$/);
      await postGate;
      return route.fulfill({ status: 201, json: { order: { id: orderId } } });
    }
    if (url.pathname === `/api/orders/${orderId}`) return route.fulfill({ json: { order: {
      id: orderId, table_id: tableId, table_label: "Mesa QA", status: "delivered", total_cents: 1990,
      needs_confirmation: false, confirmed_at: null, items: [{ item_name: "Porção de camarão", quantity: 1, unit_price_cents: 1990, note: null }],
    } } });
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(({ menu, otherTableId }) => {
    localStorage.setItem(`cd.menu.${menu.table.id}`, JSON.stringify(menu));
    localStorage.setItem(`cd.menu.${otherTableId}`, JSON.stringify({ ...menu, table: { id: otherTableId, label: "Outra mesa" } }));
  }, { menu, otherTableId });
  await page.goto(`${origin}/m/${tableId}`);
  const add = page.getByRole("button", { name: "Adicionar Porção de camarão", exact: true });
  await add.waitFor();
  const search = page.getByRole("searchbox", { name: "Buscar no cardápio" });
  await search.fill("CAMARAO limao");
  await add.waitFor();
  await search.fill("inexistente");
  await page.getByText("Nenhum item corresponde à busca.", { exact: false }).waitFor();
  assert.equal(await add.count(), 0);
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await add.click();
  const cartButton = page.getByRole("button", { name: /Ver carrinho/ });
  await cartButton.click();
  const dialog = page.getByRole("dialog", { name: "Seu pedido" });
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
  await search.evaluate((element) => element.focus());
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
  // Tab pode alcançar a barra do navegador, mas nunca o menu inerte atrás do modal.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press(i < 7 ? "Tab" : "Shift+Tab");
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement) || !document.hasFocus()), true);
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await cartButton.evaluate((element) => element === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await cartButton.click();
  await page.mouse.click(4, 4);
  await dialog.waitFor({ state: "hidden" });
  await cartButton.click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: ".next/client-ux-cart-320.png" });
  await dialog.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("dialog")?.getAttribute("aria-busy") === "true");
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await dialog.getByRole("button", { name: "Fechar", exact: true }).isDisabled(), true);
  releasePost();
  await page.waitForURL(`**/pedido/${orderId}`);
  assert.equal(posts, 1);
  assert.deepEqual(await page.evaluate((tableId) => {
    const values = JSON.parse(localStorage.getItem(`cd.recent-orders.${tableId}`));
    return { count: values.length, keys: Object.keys(values[0]).sort(), id: values[0].id };
  }, tableId), { count: 1, keys: ["id", "savedAt"], id: orderId });
  await page.getByRole("link", { name: "Fazer outro pedido" }).click();
  const recent = page.getByRole("link", { name: /Acompanhar #/ });
  await recent.waitFor();
  assert.equal(await recent.getAttribute("href"), `/pedido/${orderId}`);
  assert.equal(await cartButton.count(), 0);
  await page.reload();
  await recent.waitFor();
  await page.screenshot({ path: ".next/client-ux-menu-320.png" });
  await page.goto(`${origin}/m/${otherTableId}`);
  await add.waitFor();
  assert.equal(await recent.count(), 0);
  await page.goto(`${origin}/m/${tableId}`);
  await page.getByRole("button", { name: "Limpar atalhos" }).click();
  assert.equal(await recent.count(), 0);
  await page.reload();
  await add.waitFor();
  assert.equal(await recent.count(), 0);
  assert.deepEqual(errors, []);
  console.log("UX OK: busca, mobile 320px, foco/Tab/Escape/fundo, envio bloqueado e único, recuperação/reload/isolamento/limpeza. APIs simuladas; nenhuma integração Supabase testada.");
} finally {
  await browser?.close();
  server.kill();
  await exited;
}
