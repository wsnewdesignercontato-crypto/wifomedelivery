import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";
import { createPaymentService } from "../src/lib/asaas-payment-service.server.ts";
const contract = await readFile(
  new URL("../supabase/tests/asaas-payments.sql", import.meta.url),
  "utf8",
);
async function fixture(run) {
  const db = await createPaymentDatabase();
  try {
    await db.exec(contract.slice(0, contract.indexOf("INSERT INTO public.cart_items")));
    const ids = Object.fromEntries(
      (await db.query("select kind,id from ap_ids")).rows.map((x) => [x.kind, x.id]),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.customer]);
    await db.exec(
      `INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${ids.customer}','${ids.store}','${ids.product}','Review fixture',1,1)`,
    );
    const oid = (
      await db.query(
        "select public.checkout_online_order($1,gen_random_uuid(),'cartao','pickup',NULL,NULL,NULL,1000) result",
        [ids.store],
      )
    ).rows[0].result.order_id;
    const c = (
      await db.query("select public.asaas_customer_claim($1,'production') result", [ids.customer])
    ).rows[0].result;
    await db.query("select public.asaas_customer_complete($1,'production',$2,'cus_review')", [
      ids.customer,
      c.operationId,
    ]);
    const claim = async (retry) =>
      (
        await db.query("select public.asaas_payment_claim($1,$2,$3) result", [
          ids.customer,
          oid,
          retry ?? false,
        ])
      ).rows[0].result;
    const decline = (a) =>
      db.query("select public.asaas_payment_fail($1,$2,'declined')", [a.attemptId, a.operationId]);
    const pay = async (a, id, status = "RECEIVED") => {
      const s = {
        id,
        customerId: "cus_review",
        externalReference: a.externalReference,
        billingType: "CREDIT_CARD",
        valueCents: 1000,
        netValueCents: 970,
        refundedValueCents: status === "REFUNDED" ? 1000 : 0,
        status,
      };
      return (
        await db.query("select public.asaas_payment_apply($1,$2) result", [
          a.attemptId,
          JSON.stringify(s),
        ])
      ).rows[0].result;
    };
    const order = async () =>
      (await db.query("select status,online_payment_state from public.orders where id=$1", [oid]))
        .rows[0];
    const deliver = async () => {
      for (const s of ["accepted", "preparing", "ready", "delivered"])
        await db.query("update public.orders set status=$1 where id=$2", [s, oid]);
      await db.query(
        "insert into public.platform_ledger(order_id,establishment_id,gross_cents,merchant_payout_cents,status) select $1,$2,1000,850,'pending' where not exists(select from public.platform_ledger where order_id=$1)",
        [oid, ids.store],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.admin]);
      await db.query("select public.settle_order_payment($1,'review fixture receipt')", [oid]);
    };
    await run({ db, ids, oid, claim, decline, pay, order, deliver });
  } finally {
    await db.close();
  }
}
test("first actual funding wins even when an older declined attempt is paid before a newer one", () =>
  fixture(async ({ db, oid, claim, decline, pay, order }) => {
    const a = await claim();
    await decline(a);
    const b = await claim(true);
    await pay(a, "pay_review_a");
    await pay(b, "pay_review_b");
    assert.equal((await order()).online_payment_state, "refund_pending");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from asaas_private.payment_issues where order_id=$1 and resolved_at is null",
          [oid],
        )
      ).rows[0].n,
      1,
    );
    await pay(b, "pay_review_b", "REFUNDED");
    assert.deepEqual(await order(), { status: "placed", online_payment_state: "received" });
  }));
test("two extra payments remain distinct and wallet credit can be reviewed again after both refunds", () =>
  fixture(async ({ db, oid, claim, decline, pay, order, deliver }) => {
    const a = await claim();
    await decline(a);
    const b = await claim(true);
    await decline(b);
    const c = await claim(true);
    await pay(c, "pay_primary");
    await deliver();
    await pay(a, "pay_extra_a");
    await pay(b, "pay_extra_b");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from asaas_private.payment_issues where order_id=$1 and kind='duplicate_payment' and resolved_at is null",
          [oid],
        )
      ).rows[0].n,
      2,
    );
    await pay(a, "pay_extra_a", "REFUNDED");
    assert.equal((await order()).online_payment_state, "refund_pending");
    await pay(b, "pay_extra_b", "REFUNDED");
    assert.deepEqual(await order(), { status: "delivered", online_payment_state: "received" });
    await db.query("select public.settle_order_payment($1,'reviewed both extra refunds')", [oid]);
    assert.equal(
      (await db.query("select status from public.platform_ledger where order_id=$1", [oid])).rows[0]
        .status,
      "paid",
    );
  }));
test("cancellation intent is idempotent after local cancellation and no-attempt cancellation is terminal", () =>
  fixture(async ({ db, ids, oid }) => {
    await db.query("select public.asaas_payment_cancel_request($1,$2)", [ids.customer, oid]);
    const again = (
      await db.query("select public.asaas_payment_cancel_request($1,$2) result", [
        ids.customer,
        oid,
      ])
    ).rows[0].result;
    assert.equal(again.state, "cancelled");
  }));
test("admin browser cannot fabricate refund metadata for an online order", () =>
  fixture(async ({ db, ids, oid }) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.admin]);
    await db.exec("SET LOCAL ROLE authenticated");
    await assert.rejects(
      db.query(
        "update public.orders set refund_status='completed',refund_amount_cents=total_cents,refunded_at=now() where id=$1",
        [oid],
      ),
      (e) => e.code === "42501",
    );
  }));
test("historical credentials and customer identity survive email, API key and token changes", () =>
  fixture(async ({ db, ids, claim, pay, deliver }) => {
    const a = await claim();
    await pay(a, "pay_history");
    await deliver();
    await db.query(
      "select public.asaas_settings_save('production','changed@example.invalid',NULL,NULL)",
    );
    const old = await db.query("select public.asaas_payment_credentials('production',$1) result", [
      a.revision,
    ]);
    assert.equal(old.rows[0].result.apiKey, "k".repeat(64));
    await db.query(
      "select public.asaas_settings_save('production','changed@example.invalid',$1,$2)",
      ["n".repeat(64), "z".repeat(64)],
    );
    const history = (
      await db.query("select public.asaas_payment_credentials('production',$1) result", [
        a.revision,
      ])
    ).rows[0].result;
    assert.equal(history.apiKey, "k".repeat(64));
    const customer = (
      await db.query("select public.asaas_customer_claim($1,'production') result", [ids.customer])
    ).rows[0].result;
    assert.equal(customer.customerId, null);
    await pay(a, "pay_history");
    const tokens = (await db.query("select public.asaas_webhook_tokens('production') result"))
      .rows[0].result;
    assert.ok(tokens.includes("t".repeat(64)));
    assert.ok(tokens.includes("z".repeat(64)));
  }));
test("background cleanup executes one DELETE after an interrupted local cancellation", () =>
  fixture(async ({ db, ids, oid, claim, pay }) => {
    const a = await claim();
    await pay(a, "pay_cancel", "PENDING");
    await db.query("select public.asaas_payment_cancel_request($1,$2)", [ids.customer, oid]);
    let deleted = false,
      calls = 0;
    const snapshot = {
      id: "pay_cancel",
      customerId: "cus_review",
      externalReference: a.externalReference,
      billingType: "CREDIT_CARD",
      valueCents: 1000,
      netValueCents: 970,
      refundedValueCents: 0,
      status: "PENDING",
    };
    const view = async () =>
      (await db.query("select public.asaas_payment_view($1,$2) result", [ids.customer, oid]))
        .rows[0].result;
    const store = {
      credentials: async (_e, revision) => ({
        environment: "production",
        revision,
        apiKey: "fixture",
      }),
      cancelRequest: async () => {
        await db.query("select public.asaas_payment_cancel_request($1,$2)", [ids.customer, oid]);
        return view();
      },
      view,
      apply: async (id, s) =>
        (await db.query("select public.asaas_payment_apply($1,$2) result", [id, JSON.stringify(s)]))
          .rows[0].result,
    };
    const api = {
      getAsaasPayment: async () => ({ ...snapshot, status: deleted ? "DELETED" : "PENDING" }),
      cancelAsaasPayment: async () => {
        calls++;
        deleted = true;
      },
    };
    const service = createPaymentService(store, api);
    const known = { ...a, paymentId: "pay_cancel" };
    assert.equal((await service.cancelPayment(known)).state, "cancelled");
    assert.equal((await service.cancelPayment(known)).state, "cancelled");
    assert.equal(calls, 1);
  }));
