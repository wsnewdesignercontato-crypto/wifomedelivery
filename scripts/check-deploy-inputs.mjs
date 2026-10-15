import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

assert.ok(process.argv[2], "Informe o JSON gerado por vercel deploy --dry --json.");
const bytes = await readFile(process.argv[2]);
const text = bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? "utf16le" : "utf8");
const data = JSON.parse(text.slice(text.indexOf("{")));
assert.ok(Array.isArray(data.files) && data.files.length > 0, "Lista de arquivos ausente.");
const sensitive = data.files
  .map((file) => (typeof file === "string" ? file : file.path || file.name || ""))
  .filter(
    (path) =>
      /(^|[\\/])(?:\.superpowers|\.env(?:\.|$)|\.git|auth\.json)(?:[\\/]|$|\.)/.test(path) ||
      /(^|[\\/])supabase[\\/]\.temp(?:[\\/]|$)/.test(path),
  );
assert.equal(sensitive.length, 0, "Arquivos privados aparecem no upload. Confira .vercelignore.");
console.log(
  `${data.files.length} arquivos de deploy verificados; nenhum arquivo privado incluído.`,
);
