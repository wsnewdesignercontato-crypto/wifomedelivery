import { useEffect, useState } from "react";

/**
 * Retorna `true` quando o usuário ativou "Reduzir movimento" no sistema
 * operacional (respeita `prefers-reduced-motion: reduce`).
 * Componentes devem usar este hook para desabilitar auto-scroll, auto-rotate
 * de banners e outras animações não essenciais.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}
