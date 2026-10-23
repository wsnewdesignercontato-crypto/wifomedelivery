import { supabase } from "@/integrations/supabase/client";
import { getCatalogOnlineAvailability } from "./customer-catalog.functions";
import { catalogStoreFacts, readCatalogPages, type CatalogFacts } from "./customer-catalog";

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
    readCatalogPages((from, to) =>
      supabase
        .from("coupons")
        .select(
          "id,establishment_id,ativo,starts_at,expires_at,usage_limit,used_count,type,percent,value_cents",
        )
        .in("establishment_id", ids)
        .eq("ativo", true)
        .order("id")
        .range(from, to),
    ),
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
