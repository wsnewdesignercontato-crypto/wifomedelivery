import { useEffect } from "react";

/**
 * Adiciona `.is-visible` a elementos com `.reveal` (blocos) e aplica
 * automaticamente uma animação de texto suave a títulos, parágrafos e
 * itens de lista da página, com atraso escalonado por proximidade.
 */
export function useRevealOnScroll(selector = ".reveal") {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 1) Blocos com classe .reveal explícita
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(selector));

    // 2) Auto-alvo: textos da página (evita nav/footer minúsculos e ícones)
    const textSelector = [
      "h1", "h2", "h3", "h4",
      "section p",
      "section li",
      "section span.reveal-text",
    ].join(",");
    const texts = Array.from(document.querySelectorAll<HTMLElement>(textSelector)).filter(
      (el) => {
        if (el.closest("[data-no-reveal]")) return false;
        if (el.classList.contains("text-reveal")) return false;
        const text = el.textContent?.trim() ?? "";
        return text.length > 0;
      },
    );
    texts.forEach((el) => el.classList.add("text-reveal"));

    const all = [...blocks, ...texts];
    if (all.length === 0) return;

    if (prefersReduced) {
      all.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    // Stagger por seção: elementos próximos ganham um pequeno atraso incremental
    const perSectionIndex = new WeakMap<HTMLElement, number>();
    texts.forEach((el) => {
      const section = (el.closest("section") as HTMLElement) || document.body;
      const idx = (perSectionIndex.get(section) ?? 0);
      perSectionIndex.set(section, idx + 1);
      if (!el.style.getPropertyValue("--reveal-delay")) {
        el.style.setProperty("--reveal-delay", `${Math.min(idx * 70, 500)}ms`);
      }
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" },
    );

    all.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [selector]);
}
