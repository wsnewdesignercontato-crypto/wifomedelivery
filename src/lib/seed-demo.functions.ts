import { createServerFn } from "@tanstack/react-start";

/**
 * Idempotently seeds demo establishments + products + couriers so the
 * cliente / entregador apps aren't empty during development/demo.
 * Safe to run repeatedly: skips work if demo data already exists.
 */
export const seedDemoData = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // If any approved establishment exists already, don't reseed.
  const { count: existing } = await supabaseAdmin
    .from("establishments")
    .select("id", { count: "exact", head: true })
    .eq("status", "aprovado");
  if ((existing ?? 0) > 0) {
    return { ok: true, skipped: true, count: existing };
  }

  // Look up global categories to attach establishments to.
  const { data: cats } = await supabaseAdmin.from("global_categories").select("id,slug");
  const catBy = (slug: string) => cats?.find((c) => c.slug === slug)?.id ?? null;

  const password = "Demo@2025";

  // Helper: create (or find) a demo auth user.
  async function ensureUser(email: string, nome: string, role: "estabelecimento" | "entregador") {
    // Try to create; if exists, look up.
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });
    let userId = created.data.user?.id;
    if (!userId) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    }
    if (!userId) throw new Error(`Falha ao criar usuário ${email}`);
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, nome }, { onConflict: "id" });
    return userId;
  }

  // Restaurants to create
  const restaurants: Array<{
    email: string;
    nome: string;
    descricao: string;
    categoria: string;
    logo_url: string;
    capa_url: string;
    lat: number;
    lng: number;
    endereco: string;
    cidade: string;
    estado: string;
    taxa_entrega_cents: number;
    tempo_medio_min: number;
    pedido_minimo_cents: number;
    avaliacao: number;
    produtos: Array<{ cat: string; nome: string; descricao: string; preco_cents: number; foto_url: string }>;
  }> = [
    {
      email: "demo-burguer@wifome.dev",
      nome: "Burguer da Praça",
      descricao: "Hambúrgueres artesanais grelhados na hora.",
      categoria: "hamburguer",
      logo_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&auto=format&fit=crop",
      capa_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&auto=format&fit=crop",
      lat: -23.55052, lng: -46.633308,
      endereco: "Rua das Flores, 100", cidade: "São Paulo", estado: "SP",
      taxa_entrega_cents: 599, tempo_medio_min: 35, pedido_minimo_cents: 1500, avaliacao: 4.7,
      produtos: [
        { cat: "Combos", nome: "Combo Cheddar Bacon", descricao: "Burger 180g + cheddar + bacon + fritas + refri", preco_cents: 3990, foto_url: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&auto=format&fit=crop" },
        { cat: "Combos", nome: "Combo Duplo Smash", descricao: "2 smash + queijo + fritas média + refri lata", preco_cents: 4590, foto_url: "https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=600&auto=format&fit=crop" },
        { cat: "Sanduíches", nome: "Classic Cheeseburger", descricao: "Blend 150g + queijo + alface + tomate", preco_cents: 2490, foto_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop" },
        { cat: "Sanduíches", nome: "Bacon Lover", descricao: "Blend 180g + cheddar + muito bacon", preco_cents: 2990, foto_url: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&auto=format&fit=crop" },
        { cat: "Acompanhamentos", nome: "Fritas rústicas", descricao: "Batata cortada na casa, porção 200g", preco_cents: 1490, foto_url: "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600&auto=format&fit=crop" },
        { cat: "Bebidas", nome: "Refrigerante lata", descricao: "350ml gelado", preco_cents: 690, foto_url: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop" },
      ],
    },
    {
      email: "demo-pizza@wifome.dev",
      nome: "Pizzaria Nonna Rosa",
      descricao: "Pizza napolitana em forno a lenha, massa fermentada 48h.",
      categoria: "pizza",
      logo_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop",
      capa_url: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=1200&auto=format&fit=crop",
      lat: -23.5613, lng: -46.6565,
      endereco: "Av. Paulista, 900", cidade: "São Paulo", estado: "SP",
      taxa_entrega_cents: 799, tempo_medio_min: 45, pedido_minimo_cents: 3000, avaliacao: 4.8,
      produtos: [
        { cat: "Salgadas", nome: "Margherita", descricao: "Molho, muçarela de búfala, manjericão", preco_cents: 5490, foto_url: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop" },
        { cat: "Salgadas", nome: "Pepperoni", descricao: "Molho, muçarela, pepperoni italiano", preco_cents: 5990, foto_url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop" },
        { cat: "Salgadas", nome: "Calabresa Especial", descricao: "Calabresa, cebola roxa, azeitona", preco_cents: 5290, foto_url: "https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&auto=format&fit=crop" },
        { cat: "Doces", nome: "Nutella com Morango", descricao: "Nutella derretida com morangos frescos", preco_cents: 6490, foto_url: "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600&auto=format&fit=crop" },
        { cat: "Bebidas", nome: "Refri 2L", descricao: "Coca-Cola 2 litros", preco_cents: 1490, foto_url: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&auto=format&fit=crop" },
      ],
    },
    {
      email: "demo-acai@wifome.dev",
      nome: "Açaí do Norte",
      descricao: "Açaí puro do Pará, cremoso e gelado.",
      categoria: "acai",
      logo_url: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=400&auto=format&fit=crop",
      capa_url: "https://images.unsplash.com/photo-1615486511484-92e172cc4fe0?w=1200&auto=format&fit=crop",
      lat: -23.5489, lng: -46.6388,
      endereco: "Rua Augusta, 500", cidade: "São Paulo", estado: "SP",
      taxa_entrega_cents: 499, tempo_medio_min: 25, pedido_minimo_cents: 1200, avaliacao: 4.9,
      produtos: [
        { cat: "Tigelas", nome: "Açaí 300ml", descricao: "Com granola e banana", preco_cents: 1890, foto_url: "https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600&auto=format&fit=crop" },
        { cat: "Tigelas", nome: "Açaí 500ml", descricao: "Com 3 acompanhamentos à escolha", preco_cents: 2690, foto_url: "https://images.unsplash.com/photo-1546039907-7fa05f864c02?w=600&auto=format&fit=crop" },
        { cat: "Tigelas", nome: "Açaí Fit", descricao: "Sem açúcar, com pasta de amendoim e banana", preco_cents: 2490, foto_url: "https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=600&auto=format&fit=crop" },
        { cat: "Extras", nome: "Leite condensado", descricao: "Porção 30g", preco_cents: 290, foto_url: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop" },
      ],
    },
    {
      email: "demo-marmita@wifome.dev",
      nome: "Marmitas da Dona Célia",
      descricao: "Comida caseira feita todos os dias, quentinha na hora.",
      categoria: "marmita",
      logo_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop",
      capa_url: "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200&auto=format&fit=crop",
      lat: -23.5720, lng: -46.6420,
      endereco: "Rua Vergueiro, 1200", cidade: "São Paulo", estado: "SP",
      taxa_entrega_cents: 399, tempo_medio_min: 30, pedido_minimo_cents: 1500, avaliacao: 4.6,
      produtos: [
        { cat: "Executivos", nome: "PF Bife acebolado", descricao: "Arroz, feijão, bife, batata e salada", preco_cents: 2290, foto_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop" },
        { cat: "Executivos", nome: "PF Frango grelhado", descricao: "Arroz, feijão, filé de frango, legumes", preco_cents: 2190, foto_url: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop" },
        { cat: "Executivos", nome: "Feijoada completa", descricao: "Feijoada, arroz, couve, laranja, farofa", preco_cents: 2790, foto_url: "https://images.unsplash.com/photo-1626200419199-391ae4be7a41?w=600&auto=format&fit=crop" },
        { cat: "Bebidas", nome: "Suco natural laranja", descricao: "Copo 400ml", preco_cents: 890, foto_url: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop" },
      ],
    },
  ];

  const created: string[] = [];
  for (const r of restaurants) {
    const ownerId = await ensureUser(r.email, r.nome, "estabelecimento");
    const { data: est, error: estErr } = await supabaseAdmin
      .from("establishments")
      .insert({
        owner_id: ownerId,
        nome: r.nome,
        descricao: r.descricao,
        categoria_id: catBy(r.categoria),
        logo_url: r.logo_url,
        capa_url: r.capa_url,
        endereco: r.endereco, cidade: r.cidade, estado: r.estado,
        lat: r.lat, lng: r.lng,
        taxa_entrega_cents: r.taxa_entrega_cents,
        tempo_medio_min: r.tempo_medio_min,
        pedido_minimo_cents: r.pedido_minimo_cents,
        avaliacao: r.avaliacao,
        raio_entrega_km: 10,
        status: "aprovado",
        is_open: true,
      })
      .select("id")
      .single();
    if (estErr || !est) throw new Error(`Falha ao criar estabelecimento ${r.nome}: ${estErr?.message}`);

    // menu categories
    const uniqueCats = Array.from(new Set(r.produtos.map((p) => p.cat)));
    const catIds: Record<string, string> = {};
    for (let i = 0; i < uniqueCats.length; i++) {
      const { data: mc } = await supabaseAdmin
        .from("menu_categories")
        .insert({ establishment_id: est.id, nome: uniqueCats[i], ordem: i })
        .select("id")
        .single();
      if (mc) catIds[uniqueCats[i]] = mc.id;
    }

    // products
    const rows = r.produtos.map((p, i) => ({
      establishment_id: est.id,
      menu_category_id: catIds[p.cat] ?? null,
      nome: p.nome,
      descricao: p.descricao,
      preco_cents: p.preco_cents,
      foto_url: p.foto_url,
      ordem: i,
      disponivel: true,
    }));
    await supabaseAdmin.from("products").insert(rows);
    created.push(r.nome);
  }

  // Demo couriers
  const couriers = [
    { email: "demo-moto1@wifome.dev", nome: "Carlos Entregador" },
    { email: "demo-moto2@wifome.dev", nome: "Bruno Motoboy" },
  ];
  for (const c of couriers) {
    const userId = await ensureUser(c.email, c.nome, "entregador");
    await supabaseAdmin
      .from("courier_profiles")
      .upsert(
        {
          user_id: userId,
          nome: c.nome,
          veiculo: "moto",
          placa: "ABC1D23",
          status: "offline",
        },
        { onConflict: "user_id" },
      );
  }

  return { ok: true, created, couriers: couriers.map((c) => c.email) };
});
