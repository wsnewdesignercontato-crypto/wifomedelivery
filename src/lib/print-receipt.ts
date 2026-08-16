// Gera um recibo estilo cupom (térmica 58/80mm) em uma nova janela e chama print().
// Funciona com qualquer impressora instalada no sistema operacional (USB, rede, Bluetooth),
// desde que ela esteja registrada como impressora do sistema.

export type ReceiptAddon = { nome: string; preco_extra_cents?: number; group_nome?: string };
export type ReceiptItem = {
  quantidade: number;
  nome_snapshot: string;
  preco_unit_cents: number;
  observacoes?: string | null;
  addons?: ReceiptAddon[];
};
export type ReceiptOrder = {
  id: string;
  created_at: string;
  status: string;
  subtotal_cents: number;
  frete_cents: number;
  desconto_cents: number;
  total_cents: number;
  forma_pagamento: string;
  tipo_entrega: "delivery" | "pickup" | null;
  observacoes?: string | null;
  endereco_entrega?: {
    rua?: string;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string;
    estado?: string | null;
    cep?: string | null;
  } | null;
  troco_para_cents?: number | null;
  codigo_entrega?: string | null;
};
export type ReceiptEstab = {
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
  cnpj?: string | null;
};
export type ReceiptContact = { nome?: string | null; telefone?: string | null } | null;

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAY_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  carteira: "Carteira",
};

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export function buildReceiptHtml(
  order: ReceiptOrder,
  items: ReceiptItem[],
  estab: ReceiptEstab,
  contact: ReceiptContact,
  widthMm: number = 80,
) {
  const addr = order.endereco_entrega;
  const enderecoStr = addr
    ? [
        [addr.rua, addr.numero].filter(Boolean).join(", "),
        addr.complemento,
        addr.bairro,
        [addr.cidade, addr.estado].filter(Boolean).join("/"),
        addr.cep,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const itemsHtml = items
    .map((it) => {
      const line = `${it.quantidade}x ${escapeHtml(it.nome_snapshot)}`;
      const total = fmt(it.preco_unit_cents * it.quantidade);
      const addons = (it.addons ?? [])
        .map((a) => {
          const p = a.preco_extra_cents ? ` (${fmt(a.preco_extra_cents)})` : "";
          return `<div class="ad">+ ${escapeHtml(a.nome)}${p}</div>`;
        })
        .join("");
      const obs = it.observacoes ? `<div class="obs">Obs: ${escapeHtml(it.observacoes)}</div>` : "";
      return `<div class="it"><div class="row"><span>${line}</span><span>${total}</span></div>${addons}${obs}</div>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Pedido #${order.id.slice(0, 8)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; width: ${widthMm - 6}mm; margin: 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
  .muted { color: #333; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .it { margin: 4px 0; }
  .ad { padding-left: 10px; font-size: 11px; }
  .obs { padding-left: 10px; font-style: italic; font-size: 11px; }
  .big { font-size: 14px; font-weight: 700; }
  .code { font-size: 22px; letter-spacing: 6px; text-align: center; font-weight: 800; margin: 4px 0; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
</style></head><body>
<button class="noprint" onclick="window.print()">Imprimir</button>
<h1>${escapeHtml(estab.nome)}</h1>
${estab.endereco ? `<div class="center muted">${escapeHtml(estab.endereco)}</div>` : ""}
${estab.telefone ? `<div class="center muted">Tel: ${escapeHtml(estab.telefone)}</div>` : ""}
${estab.cnpj ? `<div class="center muted">CNPJ: ${escapeHtml(estab.cnpj)}</div>` : ""}
<div class="sep"></div>
<div class="row"><span>Pedido</span><span>#${order.id.slice(0, 8).toUpperCase()}</span></div>
<div class="row"><span>Data</span><span>${new Date(order.created_at).toLocaleString("pt-BR")}</span></div>
<div class="row"><span>Tipo</span><span>${order.tipo_entrega === "pickup" ? "Retirada" : "Entrega"}</span></div>
<div class="row"><span>Pagamento</span><span>${PAY_LABEL[order.forma_pagamento] ?? order.forma_pagamento}</span></div>
${order.troco_para_cents ? `<div class="row"><span>Troco para</span><span>${fmt(order.troco_para_cents)}</span></div>` : ""}
<div class="sep"></div>
<div><strong>Cliente:</strong> ${escapeHtml(contact?.nome || "—")}</div>
${contact?.telefone ? `<div><strong>Telefone:</strong> ${escapeHtml(contact.telefone)}</div>` : ""}
${enderecoStr ? `<div><strong>Endereço:</strong> ${escapeHtml(enderecoStr)}</div>` : order.tipo_entrega === "pickup" ? `<div><em>Cliente retira no local</em></div>` : ""}
${order.codigo_entrega ? `<div class="sep"></div><div class="muted center">Código de entrega</div><div class="code">${escapeHtml(order.codigo_entrega)}</div>` : ""}
<div class="sep"></div>
${itemsHtml}
<div class="sep"></div>
<div class="row"><span>Subtotal</span><span>${fmt(order.subtotal_cents)}</span></div>
<div class="row"><span>Entrega</span><span>${fmt(order.frete_cents)}</span></div>
${order.desconto_cents ? `<div class="row"><span>Desconto</span><span>-${fmt(order.desconto_cents)}</span></div>` : ""}
<div class="row big"><span>TOTAL</span><span>${fmt(order.total_cents)}</span></div>
${order.observacoes ? `<div class="sep"></div><div><strong>Observações do pedido:</strong><br>${escapeHtml(order.observacoes)}</div>` : ""}
<div class="sep"></div>
<div class="center muted">WiFome · Bom trabalho!</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
</body></html>`;
}

export function printOrderReceipt(
  order: ReceiptOrder,
  items: ReceiptItem[],
  estab: ReceiptEstab,
  contact: ReceiptContact,
  widthMm: number = 80,
) {
  const html = buildReceiptHtml(order, items, estab, contact, widthMm);
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
