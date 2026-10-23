import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const campaignModule = await import("../src/lib/coupon-campaign-panels.ts").catch(() => null);
const id = "11111111-1111-4111-8111-111111111111";
const revision = "22222222-2222-4222-8222-222222222222";
const fixture = {
  id,
  code: "TREM15",
  type: "percent",
  percent: 15,
  value_cents: 0,
  min_order_cents: 2000,
  max_discount_cents: 1500,
  usage_limit: null,
  used_count: 0,
  ativo: true,
  starts_at: null,
  expires_at: null,
  descricao: null,
  campaign_revision: revision,
  participating: false,
  requires_reacceptance: false,
  available: true,
};

test("merchant campaigns reject malformed terms and participation flags at runtime", () => {
  assert.ok(campaignModule, "campaign contract module must exist");
  assert.deepEqual(campaignModule.parseMerchantCampaigns([fixture]), [fixture]);
  for (const change of [
    { percent: 101 },
    { percent: -1 },
    { min_order_cents: -1 },
    { max_discount_cents: -1 },
    { participating: "true" },
    { campaign_revision: "old" },
    { expires_at: "invalid" },
    { used_count: 0.2 },
    { usage_limit: -1 },
  ])
    assert.throws(() => campaignModule.parseMerchantCampaigns([{ ...fixture, ...change }]));
  assert.throws(() => campaignModule.parseMerchantCampaigns(null));
  assert.throws(() => campaignModule.parseMerchantCampaigns({ data: [fixture] }));
  assert.deepEqual(campaignModule.parseMerchantCampaigns([]), []);
});

test("legacy fixed and free delivery terms remain readable", () => {
  assert.ok(campaignModule);
  for (const type of ["fixed", "free_delivery"]) {
    const campaign = { ...fixture, type, percent: 0, value_cents: type === "fixed" ? 500 : 0 };
    assert.equal(campaignModule.parseMerchantCampaigns([campaign])[0].type, type);
  }
});

test("legacy zero-value terms remain readable but cannot be accepted", () => {
  assert.ok(campaignModule);
  for (const change of [
    { percent: 0 },
    { max_discount_cents: 0 },
    { usage_limit: 0 },
    { type: "fixed", percent: 0, value_cents: 0 },
  ]) {
    assert.equal(
      campaignModule.parseMerchantCampaigns([{ ...fixture, ...change }])[0].available,
      false,
    );
  }
  assert.equal(
    campaignModule.parseMerchantCampaigns([{ ...fixture, percent: 15.5 }])[0].percent,
    15.5,
  );
});

test("admin publication is global, active and validates percentage, money, limits and expiry", () => {
  assert.ok(campaignModule);
  const form = {
    code: " trem15 ",
    percent: "15",
    minimum: "20,50",
    maximum: "10",
    usageLimit: "100",
    description: "Campanha",
    expiresAt: "2035-01-01T18:00",
  };
  const payload = campaignModule.buildPublishedCampaign(form, new Date("2030-01-01"));
  assert.equal(payload.establishment_id, null);
  assert.equal(payload.ativo, true);
  assert.equal(payload.type, "percent");
  assert.equal(payload.code, "TREM15");
  assert.equal(payload.min_order_cents, 2050);
  assert.equal(payload.max_discount_cents, 1000);
  assert.equal(payload.usage_limit, 100);
  assert.ok(!("campaign_revision" in payload), "database generates revision");
  for (const change of [
    { percent: "0" },
    { percent: "101" },
    { percent: "NaN" },
    { percent: "1.5" },
    { minimum: "-1" },
    { maximum: "0" },
    { usageLimit: "0" },
    { usageLimit: "1.5" },
    { expiresAt: "2020-01-01T18:00" },
    { expiresAt: "invalid" },
    { code: " " },
  ])
    assert.throws(() =>
      campaignModule.buildPublishedCampaign({ ...form, ...change }, new Date("2030-01-01")),
    );
  for (const percent of ["10", "15", "20", "1", "100"]) {
    assert.equal(
      campaignModule.buildPublishedCampaign({ ...form, percent }).percent,
      Number(percent),
    );
  }
});

test("participation acknowledgements reject wrong revision and unexpected opt-in results", () => {
  assert.ok(campaignModule);
  const accepted = {
    participating: true,
    campaign_revision: revision,
    accepted_at: "2030-01-01T00:00:00Z",
  };
  assert.equal(
    campaignModule.parseParticipationResult(accepted, revision, true).participating,
    true,
  );
  assert.throws(() =>
    campaignModule.parseParticipationResult({ ...accepted, campaign_revision: id }, revision, true),
  );
  assert.throws(() =>
    campaignModule.parseParticipationResult({ ...accepted, participating: false }, revision, true),
  );
  assert.throws(() =>
    campaignModule.parseParticipationResult({ ...accepted, accepted_at: null }, revision, true),
  );
  assert.equal(
    campaignModule.parseParticipationResult(
      { ...accepted, participating: false, campaign_revision: id },
      revision,
      false,
    ).participating,
    false,
  );
});

test("request guard blocks duplicate changes and discards old account/store completions", async () => {
  assert.ok(campaignModule);
  const guard = campaignModule.createCampaignRequestGuard();
  const request = guard.begin();
  assert.ok(request);
  assert.equal(guard.begin(), null);
  assert.equal(request.isCurrent(), true);
  guard.reset(); // account/store change or unmount
  const nextRequest = guard.begin();
  assert.ok(nextRequest);
  assert.equal(request.isCurrent(), false);
  request.finish(); // a stale request must not unlock the next one
  assert.equal(guard.begin(), null);
  nextRequest.finish();
  assert.ok(guard.begin());
});

test("admin participation totals include only accepted current-revision stores and paginate all rows", async () => {
  assert.ok(campaignModule);
  const pages = [];
  const rows = await campaignModule.readAllCampaignRows(async (from, to) => {
    pages.push([from, to]);
    return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => i) : [1000], error: null };
  });
  assert.equal(rows.length, 1001);
  assert.deepEqual(pages, [
    [0, 999],
    [1000, 1999],
  ]);
  await assert.rejects(
    () =>
      campaignModule.readAllCampaignRows(async () => ({ data: null, error: new Error("Denied") })),
    /Denied/,
  );
  const count = campaignModule.countCurrentCampaignParticipants(
    [
      { coupon_id: id, campaign_revision: revision, participating: true },
      { coupon_id: id, campaign_revision: id, participating: true },
      { coupon_id: id, campaign_revision: revision, participating: false },
    ],
    id,
    revision,
  );
  assert.equal(count, 1);
});

test("admin publishes only global percentage campaigns and exposes participation counts", async () => {
  const source = await readFile(
    new URL("../src/routes/_authenticated/admin.cupons.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /buildPublishedCampaign/);
  assert.match(source, /\[10, 15, 20\]/);
  assert.match(source, /coupon_participations/);
  assert.match(source, /countCurrentCampaignParticipants/);
  assert.match(source, /readAllCampaignRows/);
  assert.match(source, /Lojas participantes/);
  assert.match(source, /Pedido mínimo/);
  assert.match(source, /Publicar cupom/);
});

test("merchant UI exposes only explicit participation and scopes reads to account and store", async () => {
  const source = await readFile(
    new URL("../src/routes/_authenticated/estabelecimento.cupons.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\.from\("coupons"\)|CupomForm|Novo cupom/);
  assert.match(source, /merchant_coupon_campaigns/);
  assert.match(source, /set_coupon_participation/);
  assert.match(source, /parseMerchantCampaigns/);
  assert.match(source, /parseParticipationResult/);
  assert.match(source, /p_revision: campaign\.campaign_revision/);
  assert.match(source, /key=\{`\$\{userId\}:\$\{estab\.id\}`\}/);
  assert.match(
    source.replace(/\s+/g, " "),
    /O desconto é custeado pela sua loja e reduz seu repasse; comissão segue regras existentes\./,
  );
  assert.match(source, /Confirmar adesão/);
  assert.match(source, /DialogDescription/);
  assert.match(source, /request\.isCurrent\(\)/);
});
