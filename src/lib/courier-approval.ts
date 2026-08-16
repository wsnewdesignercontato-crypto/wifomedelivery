export type CourierApprovalState =
  | {
      aprovacao?: string | null;
      kyc_status?: string | null;
      status?: string | null;
    }
  | null
  | undefined;

export type NormalizedReviewStatus = "approved" | "pending" | "rejected" | "blocked" | "unknown";

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isBlockedStatus(value: string | null | undefined): boolean {
  return ["blocked", "bloqueado"].includes(normalizeStatus(value));
}

export function normalizeReviewStatus(value: string | null | undefined): NormalizedReviewStatus {
  const normalized = normalizeStatus(value);

  if (!normalized) return "unknown";
  if (["approved", "aprovado"].includes(normalized)) return "approved";
  if (["pending", "pendente", "em_analise", "incompleto"].includes(normalized)) {
    return "pending";
  }
  if (["rejected", "rejeitado", "recusado"].includes(normalized)) return "rejected";
  if (["blocked", "bloqueado"].includes(normalized)) return "blocked";

  return "unknown";
}

export function isCourierApproved(courier: CourierApprovalState): boolean {
  if (!courier) return false;
  if (isBlockedStatus(courier.status)) return false;

  const approval = normalizeReviewStatus(courier.aprovacao);
  const kyc = normalizeReviewStatus(courier.kyc_status);

  if (approval === "rejected" || approval === "blocked") return false;
  if (kyc === "rejected" || kyc === "blocked") return false;

  return approval === "approved" || kyc === "approved";
}

export function canCourierGoOnline(courier: CourierApprovalState): boolean {
  return isCourierApproved(courier);
}

export function canCourierAccessRides(courier: CourierApprovalState): boolean {
  return isCourierApproved(courier);
}

export function getCourierApprovalLabel(courier: CourierApprovalState): string {
  if (!courier) return "Cadastro pendente";
  if (isBlockedStatus(courier.status)) return "Cadastro bloqueado";

  const approval = normalizeReviewStatus(courier.aprovacao);
  const kyc = normalizeReviewStatus(courier.kyc_status);

  if (approval === "rejected" || kyc === "rejected") return "Cadastro rejeitado";
  if (isCourierApproved(courier)) return "Cadastro validado";

  return "Cadastro em analise";
}

export function getKycLabel(value: string | null | undefined): string {
  const normalized = normalizeReviewStatus(value);

  if (normalized === "approved") return "Aprovado";
  if (normalized === "pending") return "Em analise";
  if (normalized === "rejected") return "Rejeitado";
  if (normalized === "blocked") return "Bloqueado";

  return "Pendente";
}
