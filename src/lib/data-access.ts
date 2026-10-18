// Explicit projections keep private financial data and confirmation secrets off public reads.
export const ESTABLISHMENT_SELECT =
  "avaliacao,capa_url,categoria_id,cidade,cor_destaque,created_at,descricao,endereco,estado,id,instagram,is_open,kyc_motivo,kyc_status,lat,lng,logo_url,nome,onboarding_completed,owner_id,pedido_minimo_cents,printer_auto,printer_enabled,printer_width_mm,raio_entrega_km,razao_social,score_mensal,score_ym,site,slogan,status,taxa_entrega_cents,telefone,tempo_medio_min,tipos,updated_at,whatsapp";
export const ORDER_SELECT =
  "acceptance_deadline,cancellation_reason,cancelled_at,cancelled_by,cancelled_role,cliente_id,codigo_expira_em,created_at,desconto_cents,dinheiro_recebido,endereco_entrega,entrega_metodo_prova,entrega_observacao,establishment_id,forma_pagamento,frete_cents,id,observacoes,prova_assinatura,prova_url,refund_amount_cents,refund_status,refunded_at,status,subtotal_cents,tempo_estimado_min,tipo_entrega,total_cents,troco_para_cents,updated_at";

/** Recover a stored object path, including attachments saved as expiring legacy URLs. */
export function chatAttachmentPath(value: string | null): string | null {
  if (!value) return null;
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const marker = "/chat-attachments/";
      const position = url.pathname.indexOf(marker);
      if (position < 0) return null;
      path = decodeURIComponent(url.pathname.slice(position + marker.length));
    } catch {
      return null;
    }
  }
  if (
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    return null;
  return path;
}
