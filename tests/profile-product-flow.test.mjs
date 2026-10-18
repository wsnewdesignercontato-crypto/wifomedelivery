import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
import { priceInCents, validateAddonDrafts } from "../src/lib/product-configuration.ts";
import {
  CATEGORY_CATALOG,
  categoryLabel,
  normalizedCategory,
} from "../src/lib/product-category-catalog.ts";
import { getCategoryKind } from "../src/lib/category-templates.ts";
const migration = new URL(
  "../supabase/migrations/20261018052258_fix_profile_and_product_flows.sql",
  import.meta.url,
);

test("catalog covers requested segments and maps every preset to its correct customization", () => {
  assert.ok(CATEGORY_CATALOG.length >= 90);
  assert.equal(
    new Set(CATEGORY_CATALOG.map((item) => normalizedCategory(categoryLabel(item)))).size,
    CATEGORY_CATALOG.length,
  );
  for (const preset of CATEGORY_CATALOG)
    assert.equal(getCategoryKind(categoryLabel(preset)), preset.kind);
  for (const name of [
    "Refrigerantes",
    "Lanches",
    "Salgados",
    "Medicamentos",
    "Buquês",
    "Arroz e feijão",
    "Documentos",
  ])
    assert.ok(
      CATEGORY_CATALOG.some((item) => item.name === name),
      name,
    );
});
test("addon prices and limits reject ambiguous or invalid configuration before writing", () => {
  assert.equal(priceInCents("2,50"), 250);
  assert.equal(priceInCents("18.00"), 1800);
  for (const value of ["NaN", "-1", "2.123", "1.000,50", "abc", ""])
    assert.throws(() => priceInCents(value));
  const group = {
    nome: "Adicionais",
    obrigatorio: false,
    minimo: 0,
    maximo: 2,
    itens: [
      { nome: "Bacon", preco: "5,00" },
      { nome: "Queijo", preco: "3.00" },
    ],
  };
  assert.equal(validateAddonDrafts([group])[0].itens[0].preco_extra_cents, 500);
  for (const change of [
    { minimo: 3 },
    { maximo: -1 },
    { nome: " " },
    { obrigatorio: true, minimo: 0 },
    { itens: [] },
  ])
    assert.throws(() => validateAddonDrafts([{ ...group, ...change }]));
});

test("saved profiles stay complete on repeated database reads; shop contact is read from the shop", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(await readFile(migration, "utf8"));
    const owner = "11000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users(id,email) values($1,'contract@example.invalid')", [
      owner,
    ]);
    await db.query(
      "insert into public.profiles(id,nome,telefone) values($1,'Pessoa de teste',null)",
      [owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    let result = (
      await db.query("select public.check_profile_complete($1,'cliente') as result", [owner])
    ).rows[0].result;
    assert.equal(result.redirect, "/cliente/perfil/conta");
    assert.ok(result.missing.includes("telefone"));
    await db.query("update public.profiles set telefone='(31) 99999-9999' where id=$1", [owner]);
    await db.query(
      "insert into public.addresses(user_id,label,rua,cidade,is_default) values($1,'Casa','Rua de teste','Cidade',false)",
      [owner],
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await db.query("select public.check_profile_complete($1,'cliente') as result", [owner]))
          .rows[0].result.complete,
        true,
      );
    await db.query("update public.profiles set telefone=null where id=$1", [owner]);
    await db.query(
      "insert into public.establishments(owner_id,nome,telefone,cnpj) values($1,'Loja','31999999999','00000000000000')",
      [owner],
    );
    for (let i = 0; i < 2; i++) {
      result = (
        await db.query("select public.check_profile_complete($1,'estabelecimento') as result", [
          owner,
        ])
      ).rows[0].result;
      assert.equal(result.complete, true);
      assert.deepEqual(result.missing, []);
    }
    await db.query(
      "insert into public.courier_profiles(user_id,cpf,cidade_atuacao,telefone) values($1,'00000000000','Cidade','31999999999')",
      [owner],
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await db.query("select public.check_profile_complete($1,'entregador') as result", [owner]))
          .rows[0].result.complete,
        true,
      );
    await db.query("update public.establishments set telefone='123' where owner_id=$1", [owner]);
    result = (
      await db.query("select public.check_profile_complete($1,'estabelecimento') as result", [
        owner,
      ])
    ).rows[0].result;
    assert.deepEqual(result.missing, ["telefone_loja"]);
    await assert.rejects(
      db.query(
        "select public.check_profile_complete('11000000-0000-4000-8000-000000000099','cliente')",
      ),
      /autorizado/,
    );
    await assert.rejects(
      db.query("select public.check_profile_complete($1,'admin')", [owner]),
      /inválido/,
    );
  } finally {
    await db.close();
  }
});

test("product configuration saves categories and paid choices atomically with tenant protection", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(await readFile(migration, "utf8"));
    const owner = "22000000-0000-4000-8000-000000000001",
      other = "22000000-0000-4000-8000-000000000002";
    const shop = "22000000-0000-4000-8000-000000000003",
      foreign = "22000000-0000-4000-8000-000000000004";
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'other@example.invalid')",
      [owner, other],
    );
    await db.query(
      "insert into public.profiles(id,nome,telefone) values($1,'Owner','31999999999'),($2,'Other','31999999999')",
      [owner, other],
    );
    await db.query(
      "insert into public.establishments(id,owner_id,nome,status,is_open) values($1,$2,'Loja','aprovado',true),($3,$4,'Outra loja','aprovado',true)",
      [shop, owner, foreign, other],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const cat = (
      await db.query(
        "select public.ensure_menu_category($1,'Lanches e fast food / Lanches') as category",
        [shop],
      )
    ).rows[0].category;
    const catAgain = (
      await db.query(
        "select public.ensure_menu_category($1,'Lanches e fast food / Lanches') as category",
        [shop],
      )
    ).rows[0].category;
    assert.equal(cat.id, catAgain.id);
    await assert.rejects(
      db.query("select public.ensure_menu_category($1,'Categoria invasora')", [foreign]),
      /autorizada/,
    );
    const product = {
      establishment_id: shop,
      nome: "X-Salada",
      preco_cents: 1800,
      preco_promo_cents: null,
      menu_category_id: cat.id,
      estoque: 100,
      disponivel: true,
    };
    const groups = [
      {
        nome: "Adicionais",
        obrigatorio: false,
        minimo: 0,
        maximo: 2,
        itens: [
          { nome: "Bacon", preco_extra_cents: 500 },
          { nome: "Queijo", preco_extra_cents: 300 },
        ],
      },
    ];
    const save = (id, p = product, g = groups, links = [], variants = []) =>
      db.query(
        "select public.save_product_configuration($1,$2::jsonb,$3::jsonb,$4::uuid[],$5::jsonb) as id",
        [id, JSON.stringify(p), JSON.stringify(variants), links, JSON.stringify(g)],
      );
    const id = (await save(null)).rows[0].id;
    let saved = (
      await db.query(
        "select p.nome,p.menu_category_id,g.selecao_multipla,g.maximo from public.products p join public.product_addon_groups l on l.product_id=p.id join public.addon_groups g on g.id=l.addon_group_id where p.id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(saved.menu_category_id, cat.id);
    assert.equal(saved.selecao_multipla, true);
    assert.equal(saved.maximo, 2);
    const options = (
      await db.query(
        "select a.id,a.nome,a.preco_extra_cents from public.addons a join public.product_addon_groups l on l.addon_group_id=a.addon_group_id where l.product_id=$1 order by a.nome",
        [id],
      )
    ).rows;
    assert.deepEqual(
      options.map((item) => item.preco_extra_cents),
      [500, 300],
    );

    await db.query(
      "insert into public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade,addons) values($1,$2,$3,'X-Salada',1,1,$4::jsonb)",
      [owner, shop, id, JSON.stringify(options.map((option) => ({ id: option.id })))],
    );
    const quote = (
      await db.query("select public.quote_checkout($1,'pickup',null) as result", [shop])
    ).rows[0].result;
    assert.equal(quote.subtotal_cents, 2600);
    const gid = (
      await db.query("select addon_group_id from public.product_addon_groups where product_id=$1", [
        id,
      ])
    ).rows[0].addon_group_id;
    await assert.rejects(
      save(id, { ...product, nome: "Não pode persistir" }, [
        {
          nome: "Inválido",
          obrigatorio: true,
          minimo: 2,
          maximo: 2,
          itens: [{ nome: "Único", preco_extra_cents: 0 }],
        },
      ]),
      /suficientes/,
    );
    assert.equal(
      (await db.query("select nome from public.products where id=$1", [id])).rows[0].nome,
      "X-Salada",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.product_addon_groups where product_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
    await save(id, { ...product, nome: "X-Salada atualizado" }, [], [gid]);
    assert.equal(
      (await db.query("select nome from public.products where id=$1", [id])).rows[0].nome,
      "X-Salada atualizado",
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await assert.rejects(save(id, product, [], [gid]), /autorizada/);
  } finally {
    await db.close();
  }
});

test("product photo storage restricts each owner's writes and permits cleanup after failed saves", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
    `);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261018052259_product_photos.sql", import.meta.url),
        "utf8",
      ),
    );
    const owner = "33000000-0000-4000-8000-000000000001",
      other = "33000000-0000-4000-8000-000000000002",
      shop = "33000000-0000-4000-8000-000000000003";
    await db.query(
      "insert into auth.users(id,email) values($1,'photo-owner@example.invalid'),($2,'photo-other@example.invalid')",
      [owner, other],
    );
    await db.query(
      "insert into public.establishments(id,owner_id,nome) values($1,$2,'Loja de foto')",
      [shop, owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    await db.query("insert into storage.objects(bucket_id,name) values('product-photos',$1)", [
      shop + "/produto.jpg",
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('product-photos',$1)", [
        shop + "/invasor.jpg",
      ]),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query("delete from storage.objects where name=$1 returning name", [
          shop + "/produto.jpg",
        ])
      ).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    assert.equal(
      (
        await db.query("delete from storage.objects where name=$1 returning name", [
          shop + "/produto.jpg",
        ])
      ).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
