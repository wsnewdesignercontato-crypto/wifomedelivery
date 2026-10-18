import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
import { partitionAddonGroups } from "../src/lib/catalog-selection.ts";
const hooks = loadTsx();
const { ProductCategoryPicker } = await import("../src/components/product-category-picker.tsx");
const { ProductPhotoField } = await import("../src/components/product-photo-field.tsx");
const { ProductAddonSelector } = await import("../src/components/product-addon-selector.tsx");
test.after(() => hooks.deregister());
const groups = [
  {
    id: "general",
    nome: "Molhos",
    menu_category_id: null,
    obrigatorio: false,
    minimo: 0,
    maximo: 2,
    ativo: true,
  },
  {
    id: "pizza",
    nome: "Bordas",
    menu_category_id: "pizza-category",
    obrigatorio: true,
    minimo: 1,
    maximo: 1,
    ativo: true,
  },
  {
    id: "burger",
    nome: "Ponto da carne",
    menu_category_id: "burger-category",
    obrigatorio: false,
    minimo: 0,
    maximo: 1,
    ativo: true,
  },
];
test("product category field only selects the shop's existing categories without creating entities", () => {
  const html = renderToStaticMarkup(
    createElement(ProductCategoryPicker, {
      categories: [{ id: "pizza", nome: "Pizzas" }],
      value: "pizza",
      onChange() {},
    }),
  );
  assert.match(html, /value="pizza" selected="">Pizzas/);
  assert.equal((html.match(/<option/g) || []).length, 2);
  assert.doesNotMatch(html, /Criar|Cadastrar|sugestão|<input|<button/);
  const empty = renderToStaticMarkup(
    createElement(ProductCategoryPicker, { categories: [], value: "", onChange() {} }),
  );
  assert.match(empty, /Nenhuma categoria cadastrada/);
  assert.doesNotMatch(empty, /Hambúrgueres/);
});
test("category organization keeps selected groups when the product changes category", () => {
  const selected = new Set(["pizza"]);
  let result = partitionAddonGroups(groups, "pizza-category", selected);
  assert.deepEqual(
    result.recommended.map((group) => group.id),
    ["general", "pizza"],
  );
  result = partitionAddonGroups(groups, "burger-category", selected);
  assert.deepEqual(
    result.recommended.map((group) => group.id),
    ["general", "burger"],
  );
  assert.deepEqual(
    result.selectedElsewhere.map((group) => group.id),
    ["pizza"],
  );
  const html = renderToStaticMarkup(
    createElement(ProductAddonSelector, {
      groups,
      categories: [
        { id: "pizza-category", nome: "Pizzas" },
        { id: "burger-category", nome: "Lanches" },
      ],
      categoryId: "burger-category",
      selected,
      onToggle() {},
      disabled: false,
    }),
  );
  assert.match(html, /Também selecionados/);
  assert.match(html, /aria-checked="true"/);
  assert.doesNotMatch(html, /Novo grupo|Sugerir adicionais/);
});
test("photo field uses a compact preview action and one line of image requirements", () => {
  const html = renderToStaticMarkup(
    createElement(ProductPhotoField, {
      url: "",
      file: null,
      disabled: false,
      onChange() {},
      onBusy() {},
    }),
  );
  assert.match(html, /Adicionar foto do produto/);
  assert.match(html, /Escolher foto/);
  assert.match(html, /1.000 × 1.000 px/);
  assert.match(html, /até 5 MB/);
  assert.match(html, /type="file"[^>]*class="sr-only"/);
  assert.doesNotMatch(html, /Escolha da galeria|Você pode trocar/);
});
test("central addon editor saves category, rules and prices atomically, preserving existing option IDs", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018151401_organize_addon_categories.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const owner = "44000000-0000-4000-8000-000000000001",
      other = "44000000-0000-4000-8000-000000000002",
      shop = "44000000-0000-4000-8000-000000000003",
      foreign = "44000000-0000-4000-8000-000000000004";
    await db.query(
      "insert into auth.users(id,email) values($1,'group-owner@example.invalid'),($2,'group-other@example.invalid')",
      [owner, other],
    );
    await db.query(
      "insert into public.establishments(id,owner_id,nome) values($1,$2,'Loja'),($3,$4,'Outra')",
      [shop, owner, foreign, other],
    );
    const cat = (
      await db.query(
        "insert into public.menu_categories(establishment_id,nome) values($1,'Pizzas') returning id",
        [shop],
      )
    ).rows[0].id;
    const foreignCat = (
      await db.query(
        "insert into public.menu_categories(establishment_id,nome) values($1,'Outra') returning id",
        [foreign],
      )
    ).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const payload = {
      nome: "Bordas",
      obrigatorio: true,
      minimo: 1,
      maximo: 1,
      itens: [
        { nome: "Tradicional", preco_extra_cents: 0 },
        { nome: "Catupiry", preco_extra_cents: 800 },
      ],
    };
    const save = (id, data = payload, category = cat) =>
      db.query("select public.save_addon_group_configuration($1,$2,$3,$4::jsonb) as id", [
        shop,
        id,
        category,
        JSON.stringify(data),
      ]);
    const id = (await save(null)).rows[0].id;
    const original = (
      await db.query(
        "select id,nome,preco_extra_cents from public.addons where addon_group_id=$1 order by ordem",
        [id],
      )
    ).rows;
    assert.deepEqual(
      original.map((item) => item.preco_extra_cents),
      [0, 800],
    );
    assert.equal(
      (await db.query("select menu_category_id from public.addon_groups where id=$1", [id])).rows[0]
        .menu_category_id,
      cat,
    );
    await save(id, {
      ...payload,
      itens: original.map((item) => ({ ...item, preco_extra_cents: item.preco_extra_cents + 100 })),
    });
    assert.deepEqual(
      (
        await db.query("select id from public.addons where addon_group_id=$1 order by ordem", [id])
      ).rows.map((item) => item.id),
      original.map((item) => item.id),
    );
    await assert.rejects(
      save(id, {
        ...payload,
        nome: "Não deve persistir",
        itens: [{ nome: "Inválido", preco_extra_cents: -1 }],
      }),
      /preço/,
    );
    assert.equal(
      (await db.query("select nome from public.addon_groups where id=$1", [id])).rows[0].nome,
      "Bordas",
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.addons where addon_group_id=$1", [id]))
        .rows[0].n,
      2,
    );
    await assert.rejects(save(id, payload, foreignCat), /autorizada/);
    await assert.rejects(
      db.query("update public.addon_groups set menu_category_id=$1 where id=$2", [foreignCat, id]),
      /mesma loja/,
    );
    await save(id, { ...payload, itens: original }, null);
    assert.equal(
      (await db.query("select menu_category_id from public.addon_groups where id=$1", [id])).rows[0]
        .menu_category_id,
      null,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await assert.rejects(save(id), /autorizada/);
  } finally {
    await db.close();
  }
});
