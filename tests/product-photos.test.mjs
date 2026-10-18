import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
import { productPhotos } from "../src/lib/product-photos.ts";
const hooks = loadTsx();
const { ProductPhotoGallery } = await import("../src/components/product-photo-gallery.tsx");
const { ProductPhotoField } = await import("../src/components/product-photo-field.tsx");
test.after(() => hooks.deregister());
test("photo selection preserves order, promotes a remaining cover, removes duplicates and limits to three", () => {
  assert.deepEqual(productPhotos("a", ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(productPhotos("", ["b", "c"]), ["b", "c"]);
  assert.deepEqual(productPhotos("a", ["a", "b", "c", "d"]), ["a", "b", "c"]);
  assert.deepEqual(productPhotos(null), []);
});
test("three photo slots label only the two extras as optional; customer sees three accessible selectors", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      {},
      ...[0, 1, 2].map((i) =>
        createElement(ProductPhotoField, {
          key: i,
          compact: true,
          title: i ? "Foto " + (i + 1) : "Principal",
          optional: i !== 0,
          url: "",
          file: null,
          disabled: false,
          onChange() {},
          onBusy() {},
        }),
      ),
    ),
  );
  assert.equal((html.match(/type="file"/g) || []).length, 3);
  assert.equal((html.match(/Opcional/g) || []).length, 2);
  for (const label of ["Arquivo: Principal", "Arquivo: Foto 2", "Arquivo: Foto 3"])
    assert.ok(html.includes(label));
  const gallery = renderToStaticMarkup(
    createElement(ProductPhotoGallery, {
      name: "Pizza",
      main: "https://example.invalid/a.jpg",
      extras: ["https://example.invalid/b.jpg", "https://example.invalid/c.jpg"],
    }),
  );
  assert.equal((gallery.match(/aria-pressed=/g) || []).length, 3);
  assert.match(gallery, /1 de 3/);
  assert.equal(
    renderToStaticMarkup(createElement(ProductPhotoGallery, { name: "Sem foto", main: null })),
    "",
  );
});
test("product RPC persists three photos, preserves extras for older clients and rolls back excess photos", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018052258_fix_profile_and_product_flows.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261018160514_product_photo_gallery.sql", import.meta.url),
        "utf8",
      ),
    );
    const owner = "71000000-0000-4000-8000-000000000001",
      other = "71000000-0000-4000-8000-000000000002",
      shop = "71000000-0000-4000-8000-000000000003";
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'other@example.invalid')",
      [owner, other],
    );
    await db.query("insert into public.establishments(id,owner_id,nome) values($1,$2,'Galeria')", [
      shop,
      owner,
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const category = (
      await db.query("select public.ensure_menu_category($1,'Pizzas') as cat", [shop])
    ).rows[0].cat.id;
    const payload = {
      establishment_id: shop,
      nome: "Pizza",
      menu_category_id: category,
      preco_cents: 2000,
      foto_url: "https://example.invalid/1.jpg",
      fotos_adicionais: ["https://example.invalid/2.jpg", "https://example.invalid/3.jpg"],
    };
    const save = async (id, data) =>
      (
        await db.query(
          "select public.save_product_configuration($1,$2::jsonb,'[]','{}','[]') as id",
          [id, JSON.stringify(data)],
        )
      ).rows[0].id;
    const id = await save(null, payload);
    const get = async () =>
      (
        await db.query("select nome,foto_url,fotos_adicionais from public.products where id=$1", [
          id,
        ])
      ).rows[0];
    assert.deepEqual(await get(), {
      nome: "Pizza",
      foto_url: payload.foto_url,
      fotos_adicionais: payload.fotos_adicionais,
    });
    const legacy = { ...payload, nome: "Pizza editada" };
    delete legacy.fotos_adicionais;
    await save(id, legacy);
    assert.deepEqual((await get()).fotos_adicionais, payload.fotos_adicionais);
    await assert.rejects(
      save(id, { ...payload, nome: "Não deve salvar", fotos_adicionais: ["a", "b", "c"] }),
      /products_two_extra_photos/,
    );
    assert.equal((await get()).nome, "Pizza editada");
    await assert.rejects(
      save(id, { ...payload, fotos_adicionais: [null] }),
      /products_two_extra_photos/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await assert.rejects(save(id, payload), /autorizada/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await save(id, { ...payload, fotos_adicionais: [] });
    assert.deepEqual((await get()).fotos_adicionais, []);
    const empty = await save(null, { ...legacy, foto_url: null });
    assert.ok(empty);
  } finally {
    await db.close();
  }
});
