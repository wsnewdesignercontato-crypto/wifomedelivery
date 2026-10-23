import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getCatalogOnlineAvailability } from "./customer-catalog.functions";
import { catalogStoreFacts, readCatalogPages, type CatalogFacts } from "./customer-catalog";

export type CustomerCouponOffer =
  Database["public"]["Functions"]["customer_coupon_offers"]["Returns"][number];

/** The server returns only current offers accepted by each requested store. */
export async function loadCustomerCouponOffers(ids: string[]): Promise<CustomerCouponOffer[]> {
  const uniqueIds = [...new Set(ids)];
  const offers = new Map<string, CustomerCouponOffer>();
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const storeIds = uniqueIds.slice(index, index + 100);
    const rows = await readCatalogPages((from, to) =>
      supabase.rpc("customer_coupon_offers", { p_establishment_ids: storeIds }).range(from, to),
    );
    for (const row of rows) {
      if (storeIds.includes(row.establishment_id))
        offers.set(`${row.establishment_id}:${row.id}`, row);
    }
  }
  return [...offers.values()];
}

/** Read existing public catalog permissions; a failed signal never advertises a benefit. */
export async function loadCatalogFacts(
  stores: {
    id: string;
    taxa_entrega_cents: number;
    avaliacao: number | null;
  }[],
): Promise<{ facts: Record<string, CatalogFacts>; incomplete: boolean }> {
  if (!stores.length) return { facts: {}, incomplete: false };
  const ids = stores.map((store) => store.id);
  const [products, coupons, zones, reviews, online] = await Promise.allSettled([
    readCatalogPages((from, to) =>
      supabase
        .from("products")
        .select("id,establishment_id,preco_cents,preco_promo_cents,disponivel,estoque")
        .in("establishment_id", ids)
        .eq("disponivel", true)
        .order("id")
        .range(from, to),
    ),
    loadCustomerCouponOffers(ids),
    readCatalogPages((from, to) =>
      supabase
        .from("establishment_delivery_zones")
        .select("id,establishment_id,ativo,taxa_cents")
        .in("establishment_id", ids)
        .eq("ativo", true)
        .order("id")
        .range(from, to),
    ),
    readCatalogPages((from, to) =>
      supabase
        .from("public_reviews")
        .select("id,establishment_id")
        .in("establishment_id", ids)
        .order("id")
        .range(from, to),
    ),
    getCatalogOnlineAvailability(),
  ]);
  const productRows = products.status === "fulfilled" ? products.value : [];
  const couponRows = coupons.status === "fulfilled" ? coupons.value : [];
  const zoneRows = zones.status === "fulfilled" ? zones.value : null;
  const reviewRows = reviews.status === "fulfilled" ? reviews.value : [];
  const now = new Date();
  return {
    incomplete: [products, coupons, zones, reviews, online].some(
      (result) => result.status === "rejected",
    ),
    facts: Object.fromEntries(
      stores.map((store) => [
        store.id,
        catalogStoreFacts(store, {
          products: productRows.filter((row) => row.establishment_id === store.id),
          coupons: couponRows.filter((row) => row.establishment_id === store.id),
          zones: zoneRows?.filter((row) => row.establishment_id === store.id) ?? null,
          reviewCount: reviewRows.filter((row) => row.establishment_id === store.id).length,
          onlineEnabled: online.status === "fulfilled" && online.value === true,
          now,
        }),
      ]),
    ),
  };
}
