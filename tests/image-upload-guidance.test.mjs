import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../src/lib/upload-validation.ts";

const hooks = loadTsx();
const { ImageUploadGuidance } = await import("../src/components/image-upload-guidance.tsx");
const { imageUploadGuidance } = await import("../src/lib/image-upload-guidance.ts");
const { ProductPhotoField } = await import("../src/components/product-photo-field.tsx");
test.after(() => hooks.deregister());

test("art recommendations fit each presentation and remain recommendations", () => {
  for (const [profile, dimensions] of Object.entries({
    banner: "1200 × 600 px (2:1)",
    profile: "512 × 512 px (1:1)",
    logo: "512 × 512 px (1:1)",
    product: "1080 × 1080 px (1:1)",
    cover: "1600 × 600 px (8:3)",
  })) {
    const html = renderToStaticMarkup(createElement(ImageUploadGuidance, { profile }));
    assert.ok(html.includes(dimensions), profile);
    assert.match(html, /Recomendado:/);
    assert.doesNotMatch(html, /exato|obrigatório|sr-only/);
  }
});

test("formats and file limits describe the actual upload policies", () => {
  const standard = imageUploadGuidance("banner");
  assert.deepEqual(standard.mimeTypes, ALLOWED_IMAGE_TYPES);
  assert.equal(standard.maxBytes, MAX_IMAGE_BYTES);
  assert.match(standard.formats, /JPG, PNG, WebP ou GIF/);
  const product = imageUploadGuidance("product", "product");
  assert.deepEqual(product.mimeTypes, ["image/jpeg", "image/png", "image/webp"]);
  assert.doesNotMatch(product.formats, /GIF/);
  assert.match(imageUploadGuidance("profile", "any-image").formats, /Prefira JPG, PNG ou WebP/);
});

test("documents and message/proof photos prioritize readability without art dimensions", () => {
  for (const profile of ["document", "attachment", "delivery-proof"]) {
    const html = renderToStaticMarkup(createElement(ImageUploadGuidance, { profile }));
    assert.doesNotMatch(html, /\d+ × \d+|proporção|Recomendado:/);
    assert.match(html, /legível|nítida/);
    assert.match(html, /5 MB/);
  }
});

test("compact product slots expose preparation guidance and associate it with file selection", () => {
  const html = renderToStaticMarkup(
    createElement(ProductPhotoField, {
      compact: true,
      title: "Principal",
      optional: false,
      url: "",
      file: null,
      disabled: false,
      onChange() {},
      onBusy() {},
    }),
  );
  assert.match(html, /1080 × 1080 px/);
  assert.match(html, /JPG, PNG ou WebP/);
  const help = html.match(/<p id="([^"]+)" class="([^"]*)">Recomendado:/);
  assert.ok(help, "Visible guidance is rendered as text");
  assert.doesNotMatch(help[2], /sr-only/);
  assert.ok(html.includes(`aria-describedby="${help[1]}"`));
});
