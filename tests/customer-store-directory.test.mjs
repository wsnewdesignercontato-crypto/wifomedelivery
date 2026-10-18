import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = new URL(
  "../supabase/migrations/20261018220816_customer_home_store_directory.sql",
  import.meta.url,
);
test("home discovery normalizes cities, retains closed shops and preserves approval/RLS boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE public.establishments(
 id uuid PRIMARY KEY,nome text,descricao text,categoria_id uuid,logo_url text,capa_url text,
 taxa_entrega_cents integer DEFAULT 0,tempo_medio_min integer,avaliacao numeric,is_open boolean,
 cidade text,estado text,status text);
 ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
 CREATE POLICY approved_discovery ON public.establishments FOR SELECT TO anon,authenticated USING(status='aprovado');
 GRANT SELECT ON public.establishments TO anon,authenticated;
 CREATE FUNCTION public.normalize_delivery_text(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT translate(lower(coalesce(value,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
 $$;
 INSERT INTO public.establishments(id,nome,cidade,estado,status,is_open) VALUES
 ('11000000-0000-4000-8000-000000000001','Aberta','são sebastião do paraiso','MG','aprovado',true),
 ('11000000-0000-4000-8000-000000000002','Fechada',' São Sebastião do Paraíso ','MG','aprovado',false),
 ('11000000-0000-4000-8000-000000000003','Outra cidade','Ribeirão Preto ','SP','aprovado',true),
 ('11000000-0000-4000-8000-000000000004','Pendente','São Sebastião do Paraíso','MG','pendente',true),
 ('11000000-0000-4000-8000-000000000005','Mesmo nome outro estado','São Sebastião do Paraíso','SP','aprovado',true);
 `);
    await db.exec(await readFile(migration, "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role);
      for (const city of [
        "São Sebastião do Paraíso",
        "  SAO  SEBASTIAO DO PARAISO  ",
        "são sebastião do paraiso",
      ]) {
        const { rows } = await db.query(
          "select nome,is_open from public.customer_store_directory($1,$2)",
          [city, " mg "],
        );
        assert.deepEqual(rows, [
          { nome: "Aberta", is_open: true },
          { nome: "Fechada", is_open: false },
        ]);
      }
      assert.deepEqual(
        (await db.query("select nome from public.customer_store_directory('ribeirao preto','SP')"))
          .rows,
        [{ nome: "Outra cidade" }],
      );
      const all = (await db.query("select * from public.customer_store_directory(null,null)")).rows;
      assert.equal(all.length, 4);
      assert.ok(all.every((x) => x.nome !== "Pendente"));
      assert.ok(all.every((x) => !("owner_id" in x)));
      await db.exec("RESET ROLE");
    }
    const { rows } = await db.query(
      "select prosecdef from pg_proc where proname='customer_store_directory'",
    );
    assert.equal(rows[0].prosecdef, false);
  } finally {
    await db.close();
  }
});
