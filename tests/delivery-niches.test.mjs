import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
import { loadTsx } from "./helpers/load-tsx.mjs";
import {
  DELIVERY_NICHES,
  nicheCategories,
  recommendedCategories,
} from "../src/lib/delivery-niches.ts";
import {
  productFields,
  writeProductDetails,
  readProductDetails,
  detailBadges,
  productSnapshotName,
  productSummary,
  categoryAddonTemplates,
} from "../src/lib/product-details.ts";
const hooks = loadTsx();
const { ProductSpecificFields } = await import("../src/components/product-specific-fields.tsx");
const { ProductDetails } = await import("../src/components/product-details.tsx");
const { presetExists } = await import("../src/components/niche-category-presets.tsx");
test.after(() => hooks.deregister());
test("delivery niches provide relevant ready categories and preserve existing category names", () => {
  assert.ok(DELIVERY_NICHES.length >= 30);
  assert.equal(new Set(DELIVERY_NICHES.map((item) => item.slug)).size, DELIVERY_NICHES.length);
  for (const slug of ["lanches", "farmacia", "mercado", "floricultura", "petshop", "encomendas"])
    assert.ok(recommendedCategories(slug).length, slug);
  assert.ok(nicheCategories("farmacia").every((item) => item.section === "Farmácia"));
  assert.ok(nicheCategories("mercado").some((item) => item.name === "Arroz e feijão"));
  assert.equal(presetExists("Pizzaria / Pizzas", [{ nome: "PIZZA" }]), true);
  assert.equal(presetExists("Pizzaria / Pizzas doces", [{ nome: "PIZZA" }]), false);
  assert.equal(categoryAddonTemplates("Farmácia / Medicamentos").length, 0);
  assert.ok(categoryAddonTemplates("Pizzaria / Pizzas").some((item) => item.nome === "Borda"));
});
test("beverage volume and packaging persist and are readable by customers and in cart labels", () => {
  const fields = productFields("Bebidas / Refrigerantes");
  assert.ok(fields.some((field) => field.key === "volume_ml" && field.numeric));
  const raw = writeProductDetails(
    "Refrigerante",
    { volume_ml: "350", embalagem: "Lata", marca: "Marca de teste" },
    fields,
  );
  assert.equal(readProductDetails(raw).attributes.volume_ml, "350");
  assert.ok(detailBadges(raw).some((item) => item.value === "350 ml"));
  assert.equal(productSnapshotName("Refrigerante", raw), "Refrigerante · 350 ml");
  assert.doesNotMatch(productSummary(raw), /\[\[extras:/);
  assert.throws(() => writeProductDetails("Refri", { volume_ml: "-10" }, fields), /maior que zero/);
  const form = renderToStaticMarkup(
    createElement(ProductSpecificFields, { fields, values: { volume_ml: "350" }, onChange() {} }),
  );
  assert.match(form, /Volume \(ml\)/);
  assert.match(form, /Embalagem/);
  const publicHtml = renderToStaticMarkup(createElement(ProductDetails, { value: raw }));
  assert.match(publicHtml, /350 ml/);
  assert.match(publicHtml, /Lata/);
  assert.doesNotMatch(publicHtml, /\[\[extras:/);
  assert.equal(
    writeProductDetails(raw, { volume_ml: "600" }, fields).match(/\[\[extras:/g).length,
    1,
  );
});
test("non-food products get neutral catalog fields without food additions", () => {
  for (const name of [
    "Farmácia / Medicamentos",
    "Mercado e secos e molhados / Arroz e feijão",
    "Pet shop / Ração para cães",
    "Floricultura / Buquês",
  ]) {
    assert.ok(productFields(name).length, name);
    assert.equal(
      productFields(name).some((field) => field.key === "ponto_carne"),
      false,
    );
  }
  assert.ok(productFields("Farmácia / Medicamentos").some((field) => field.key === "apresentacao"));
  assert.ok(
    productFields("Mercado e secos e molhados / Arroz e feijão").some(
      (field) => field.key === "unidade",
    ),
  );
});
test("search finds approved stores by niche, synonyms and accents, and keeps products in the selected city", async () => {
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
    const oldId = "55000000-0000-4000-8000-000000000099";
    await db.query(
      "insert into public.global_categories(id,nome,slug) values($1,'Farmácia','farmacia')",
      [oldId],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018154356_delivery_niches_and_search.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select id from public.global_categories where slug='farmacia'")).rows[0].id,
      oldId,
    );
    const owner = "55000000-0000-4000-8000-000000000001",
      other = "55000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into auth.users(id,email) values($1,'niche-owner@example.invalid'),($2,'niche-other@example.invalid')",
      [owner, other],
    );
    const globals = (await db.query("select id,slug from public.global_categories")).rows;
    const pharmacy = globals.find((item) => item.slug === "farmacia").id,
      market = globals.find((item) => item.slug === "mercado").id;
    const shop = (
      await db.query(
        "insert into public.establishments(owner_id,nome,categoria_id,cidade,status,is_open) values($1,'Saúde do bairro',$2,'São Paulo','aprovado',true) returning id",
        [owner, pharmacy],
      )
    ).rows[0].id;
    const remote = (
      await db.query(
        "insert into public.establishments(owner_id,nome,categoria_id,cidade,status,is_open) values($1,'Saúde distante',$2,'Curitiba','aprovado',true) returning id",
        [other, pharmacy],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.establishments(owner_id,nome,categoria_id,cidade,status,is_open) values($1,'Loja pendente',$2,'São Paulo','pendente',true)",
      [other, pharmacy],
    );
    for (let index = 0; index < 5; index++)
      await db.query(
        "insert into public.establishments(owner_id,nome,categoria_id,cidade,status,is_open) values($1,$2,$3,'São Paulo','aprovado',true)",
        [other, "Compra " + index, market],
      );
    await db.query(
      "insert into public.products(establishment_id,nome,preco_cents,disponivel) values($1,'Vitamina teste',1000,true),($2,'Vitamina remota',1000,true),($1,'Vitamina oculta',1000,false)",
      [shop, remote],
    );
    await db.exec(
      "create policy niche_test_approved_read on public.establishments for select to authenticated using(status='aprovado')",
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const search = async (term, city = "Sao Paulo", offset = 0, limit = 24) =>
      (
        await db.query("select public.search_delivery_catalog($1,$2,$3,$4) as result", [
          term,
          city,
          offset,
          limit,
        ])
      ).rows[0].result;
    for (const term of ["farmácia", "FARMACIAS", "drogaria", "drogarias"]) {
      const result = await search(term);
      assert.equal(result.establishment_total, 1, term);
      assert.equal(result.establishments[0].id, shop);
      assert.equal(result.establishments[0].categoria_nome, "Farmácia");
      assert.equal("owner_id" in result.establishments[0], false);
      assert.equal("cnpj" in result.establishments[0], false);
    }
    assert.equal((await search("vitamina")).products.length, 1);
    assert.equal((await search("%")).establishments.length, 0);
    const first = await search("supermercado", "São Paulo", 0, 2),
      second = await search("mercearia", "São Paulo", 2, 2),
      third = await search("mercados", "São Paulo", 4, 2);
    assert.equal(first.establishment_total, 5);
    assert.equal(
      new Set(
        [...first.establishments, ...second.establishments, ...third.establishments].map(
          (item) => item.id,
        ),
      ).size,
      5,
    );
    const names = ["Bebidas / Refrigerantes", "Lanches e fast food / Lanches"];
    const bulk = async (shopId, values) =>
      (
        await db.query("select public.ensure_menu_categories($1,$2::text[]) as result", [
          shopId,
          values,
        ])
      ).rows[0].result;
    const a = await bulk(shop, names),
      b = await bulk(shop, names);
    assert.deepEqual(new Set(a.map((item) => item.id)), new Set(b.map((item) => item.id)));
    await assert.rejects(bulk(shop, ["Categoria que deve reverter", "x".repeat(101)]), /inválido/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.menu_categories where establishment_id=$1",
          [shop],
        )
      ).rows[0].n,
      2,
    );
    await assert.rejects(bulk(remote, names), /autorizada/);
  } finally {
    await db.close();
  }
});
