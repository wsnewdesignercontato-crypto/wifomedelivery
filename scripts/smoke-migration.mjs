import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = new URL(process.argv[2] || "http://localhost:4173");
assert.ok(["http:", "https:"].includes(base.protocol), "Informe uma URL HTTP ou HTTPS.");
assert.ok(
  !base.username && !base.password && !base.search && !base.hash,
  "Informe somente a origem.",
);
const endpoints = [
  ["/", "text/html"],
  ["/auth", "text/html"],
  ["/termos", "text/html"],
  ["/privacidade", "text/html"],
  ["/sitemap.xml", "xml"],
  ["/robots.txt", "text/plain"],
  ["/manifest.webmanifest", "json"],
];
const headers = {};
if (process.argv.includes("--vercel")) {
  assert.ok(
    base.protocol === "https:" && base.hostname.endsWith(".vercel.app"),
    "Use o domínio Vercel do projeto vinculado.",
  );
  assert.ok(process.env.VERCEL_OIDC_TOKEN, "Atualize as credenciais com vercel env pull.");
  headers["x-vercel-trusted-oidc-idp-token"] = process.env.VERCEL_OIDC_TOKEN;
}
for (const file of (await readdir("src/assets")).filter((name) => name.endsWith(".asset.json"))) {
  const asset = JSON.parse(await readFile(`src/assets/${file}`, "utf8"));
  endpoints.push([asset.url, asset.content_type]);
}

let failures = 0;
for (const [path, contentType] of endpoints) {
  try {
    const target = new URL(path, base);
    assert.equal(target.origin, base.origin, "O asset precisa pertencer à origem do aplicativo.");
    const response = await fetch(target, {
      headers,
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });
    assert.equal(response.status, 200, `status ${response.status}`);
    assert.ok(
      response.headers.get("content-type")?.includes(contentType),
      "Tipo de conteúdo inesperado.",
    );
    if (contentType.startsWith("image/")) {
      assert.ok((await response.arrayBuffer()).byteLength > 0, "Imagem vazia.");
    } else {
      const body = await response.text();
      assert.ok(body.length > 0, "Resposta vazia.");
      assert.ok(
        !/(?:lovable\.app|lovable\.dev|lovable\.cloud|lovable-core-prod)/i.test(body),
        "Referência antiga na resposta pública.",
      );
      if (path === "/") assert.match(body, /PedeTrem/);
      if (path === "/auth") assert.match(body, /Entrar no PedeTrem/);
      if (path === "/sitemap.xml") assert.match(body, /<urlset/);
      if (path === "/robots.txt") assert.match(body, /Sitemap: https?:\/\//);
      if (path === "/manifest.webmanifest") assert.ok(JSON.parse(body).name);
    }
    console.log(`OK ${path}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error instanceof Error ? error.message : "Erro HTTP"}`);
  }
}
console.log(
  `${endpoints.length - failures}/${endpoints.length} respostas verificadas em ${base.origin}.`,
);
process.exitCode = failures ? 1 : 0;
