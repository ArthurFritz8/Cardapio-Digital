import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Trava local: somente paths/linhas são impressos, nunca valores encontrados.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  /\b(?:ghp_|github_pat_|sb_secret_)[A-Za-z0-9_]{20,}/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:postgres(?:ql)?):\/\/[^:\s]+:[^@\s<>]+@/i,
];
const findings = [];
for (const path of new Set(files)) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example") findings.push(`${path}: arquivo de ambiente`);
  let buffer;
  try { buffer = readFileSync(path); } catch { continue; }
  if (buffer.includes(0)) continue;
  buffer.toString("utf8").split(/\r?\n/).forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) findings.push(`${path}:${index + 1}: possível segredo`);
  });
}
if (findings.length) { console.error(findings.join("\n")); process.exitCode = 1; }
else console.log(`Segredos: nenhum padrão encontrado em ${new Set(files).size} arquivos versionáveis.`);
