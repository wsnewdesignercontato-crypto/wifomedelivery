import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";

const migration = new URL(
  "../supabase/migrations/20261022215140_normalize_checkout_delivery_locations.sql",
  import.meta.url,
);
test("checkout accepts accent/case/space variants of the same city and keeps distinct cities outside delivery", async () => {
  const db = await createPaymentDatabase();
  const owner = "96000000-0000-4000-8000-000000000001",
    customer = "96000000-0000-4000-8000-000000000002",
    shop = "96000000-0000-4000-8000-000000000003",
    product = "96000000-0000-4000-8000-000000000004",
    key = "96000000-0000-4000-8000-000000000005";
  try {
    await db.exec(await readFile(migration, "utf8"));
    await db.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'owner@example.invalid',now()),($2,'customer@example.invalid',now())",
      [owner, customer],
    );
    await db.query("INSERT INTO public.profiles(id,nome) VALUES ($1,'Owner'),($2,'Customer')", [
      owner,
      customer,
    ]);
    await db.query(
      "INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents,pedido_minimo_cents) VALUES ($1,$2,'Shop','aprovado',true,'s\u00e3o sebasti\u00e3o do paraiso',900,1000)",
      [shop, owner],
    );
    await db.query(
      "INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES ($1,$2,'Product',1600,100,true)",
      [product, shop],
    );
    await db.query(
      "INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade,addons) VALUES ($1,$2,$3,'Product',1,2,'[]')",
      [customer, shop, product],
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [customer]);
    const quote = async (address, type = "delivery") =>
      (
        await db.query("SELECT public.quote_order($1,$2,'pix',$3,$4::jsonb,NULL,NULL) AS result", [
          shop,
          key,
          type,
          address ? JSON.stringify(address) : null,
        ])
      ).rows[0].result;
    const address = {
      rua: "Rua de teste",
      cidade: "  S\u00e3o   Sebasti\u00e3o do Para\u00edso  ",
      bairro: "Centro",
    };
    assert.deepEqual(await quote(address), {
      subtotal_cents: 3200,
      frete_cents: 900,
      desconto_cents: 0,
      total_cents: 4100,
    });
    await assert.rejects(
      quote({ ...address, cidade: "S\u00e3o Sebasti\u00e3o" }),
      /Address outside delivery city/,
    );
    await assert.rejects(
      quote({ ...address, cidade: "S\u00e3o Sebasti\u00e3o do Para\u00edso do Norte" }),
      /Address outside delivery city/,
    );
    assert.deepEqual(await quote(null, "pickup"), {
      subtotal_cents: 3200,
      frete_cents: 0,
      desconto_cents: 0,
      total_cents: 3200,
    });
    await db.query(
      "INSERT INTO public.establishment_delivery_zones(establishment_id,nome,bairro,taxa_cents,ativo) VALUES ($1,'Neighborhood','Jardim Sao Jose',600,true)",
      [shop],
    );
    assert.equal(
      (await quote({ ...address, bairro: " Jardim   S\u00e3o Jos\u00e9 " })).frete_cents,
      600,
    );
    await assert.rejects(
      quote({ ...address, bairro: "Jardim S\u00e3o Jos\u00e9 II" }),
      /Address outside configured delivery areas/,
    );
    // Older carts must still be rejected until the customer chooses the mandatory option.
    const group = "96000000-0000-4000-8000-000000000006",
      addon = "96000000-0000-4000-8000-000000000007";
    await db.query(
      "INSERT INTO public.addon_groups(id,establishment_id,nome,minimo,maximo,obrigatorio,ativo) VALUES ($1,$2,'Required choice',1,1,true,true)",
      [group, shop],
    );
    await db.query(
      "INSERT INTO public.addons(id,addon_group_id,nome,preco_extra_cents,ativo) VALUES ($1,$2,'Choice',0,true)",
      [addon, group],
    );
    await db.query(
      "INSERT INTO public.product_addon_groups(product_id,addon_group_id) VALUES ($1,$2)",
      [product, group],
    );
    const coveredAddress = { ...address, bairro: "Jardim Sao Jose" };
    await assert.rejects(
      quote(coveredAddress),
      /Required addon group or selection limit not satisfied/,
    );
    await db.query("UPDATE public.cart_items SET addons=$1::jsonb WHERE user_id=$2", [
      JSON.stringify([{ id: addon }]),
      customer,
    ]);
    assert.deepEqual(await quote(coveredAddress), {
      subtotal_cents: 3200,
      frete_cents: 600,
      desconto_cents: 0,
      total_cents: 3800,
    });
    await db.query("UPDATE public.products SET estoque=1 WHERE id=$1", [product]);
    await assert.rejects(quote(coveredAddress), /Product stock insufficient/);
    await db.query("UPDATE public.products SET estoque=100 WHERE id=$1", [product]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.orders")).rows[0].n, 0);
    assert.equal(
      (await db.query("SELECT quantidade FROM public.cart_items WHERE user_id=$1", [customer]))
        .rows[0].quantidade,
      2,
    );
    assert.equal(
      (await db.query("SELECT estoque FROM public.products WHERE id=$1", [product])).rows[0]
        .estoque,
      100,
    );
  } finally {
    await db.close();
  }
});
