import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

const publicRoot = resolve("public");
const pointers = (await readdir("src/assets")).filter((name) => name.endsWith(".asset.json"));
let failed = 0;
for (const name of pointers) {
  try {
    const asset = JSON.parse(await readFile(resolve("src/assets", name), "utf8"));
    const url = new URL(asset.url, "https://assets.local");
    if (url.origin !== "https://assets.local" || url.search || url.hash) {
      throw new Error("O asset deve ser servido pelo próprio aplicativo.");
    }
    const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    const localPath = relative(publicRoot, path);
    if (localPath.startsWith("..") || isAbsolute(localPath)) throw new Error("Caminho inválido.");
    const bytes = await readFile(path);
    if (bytes.length !== asset.size)
      throw new Error("O tamanho não corresponde ao arquivo original.");
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if (
      (asset.content_type === "image/png" && !png) ||
      (asset.content_type === "image/jpeg" && !jpeg)
    ) {
      throw new Error("O conteúdo não corresponde ao formato da imagem.");
    }
    console.log(`OK ${asset.original_filename} (${bytes.length} bytes)`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "erro de leitura"}`);
  }
}
if (!pointers.length) throw new Error("Nenhum ponteiro de asset encontrado.");
console.log(`${pointers.length - failed}/${pointers.length} imagens locais verificadas.`);
process.exitCode = failed ? 1 : 0;
