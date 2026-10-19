import test from "node:test";
import assert from "node:assert/strict";
test("registration writes roll back together and reject stale or administrative patches in SQL", async () => {
  const { createCheckoutDatabase } = await import("../scripts/testing/checkout-database.mjs");
  const { readFile } = await import("node:fs/promises");
  const db = await createCheckoutDatabase();
  try {
    for (const path of [
      "supabase/migrations/20261018052258_fix_profile_and_product_flows.sql",
      "supabase/migrations/20261019164748_atomic_courier_profile_persistence.sql",
      "supabase/migrations/20261019164949_courier_registration_retry_safety.sql",
    ])
      await db.exec(await readFile(new URL("../" + path, import.meta.url), "utf8"));
    const id = "94000000-0000-4000-8000-000000000001";
    await db.query(
      "INSERT INTO auth.users(id,email) VALUES($1,'courier-contract@example.invalid')",
      [id],
    );
    await db.query(
      "INSERT INTO public.profiles(id,nome,telefone) VALUES($1,'Courier','31999999999')",
      [id],
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    const save = (patch, expected) =>
      db.query("SELECT public.save_courier_registration($1,$2) AS data", [
        JSON.stringify(patch),
        JSON.stringify(expected),
      ]);
    let result = (
      await save(
        { telefone: "31988888888", cnh: "12345678901" },
        { telefone: "31999999999", cnh: null },
      )
    ).rows[0].data;
    await save(
      { telefone: "31988888888", cnh: "12345678901" },
      { telefone: "31999999999", cnh: null },
    );
    assert.equal(result.courier.cnh, "12345678901");
    assert.equal(result.profile.telefone, "31988888888");
    await assert.rejects(save({ aprovacao: "approved" }, { aprovacao: "incompleto" }), /Somente/);
    await assert.rejects(
      save({ telefone: "31977777777" }, { telefone: "31999999999" }),
      /outra tela/,
    );
    await db.exec(
      "CREATE FUNCTION public.contract_fail_cnh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cnh='99999999999' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER contract_fail_cnh BEFORE UPDATE ON public.courier_profiles FOR EACH ROW EXECUTE FUNCTION public.contract_fail_cnh();",
    );
    await assert.rejects(
      save(
        { telefone: "31977777777", cnh: "99999999999" },
        { telefone: "31988888888", cnh: "12345678901" },
      ),
      /injected/,
    );
    assert.equal(
      (await db.query("SELECT telefone FROM public.profiles WHERE id=$1", [id])).rows[0].telefone,
      "31988888888",
    );
    assert.equal(
      (await db.query("SELECT cnh FROM public.courier_profiles WHERE user_id=$1", [id])).rows[0]
        .cnh,
      "12345678901",
    );
  } finally {
    await db.close();
  }
});
