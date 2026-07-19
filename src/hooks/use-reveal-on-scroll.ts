import { useEffect } from "react";

/**
 * Animações cinematográficas: aplica reveal em blocos `.reveal`,
 * text-rise em parágrafos/listas/h3-h4, word-split em h1/h2,
 * e brilho contínuo em títulos grandes.
 */
export function useRevealOnScroll(selector = ".reveal") {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const enhance = () => {
      // 1) Blocos com classe .reveal explícita
      const blocks = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((el) => !el.dataset.revealBound);
      blocks.forEach((el) => { el.dataset.revealBound = "1"; });

      // 2) Split por palavras em títulos grandes (h1, h2)
      const bigTitles = Array.from(document.querySelectorAll<HTMLElement>("h1, h2")).filter(
        (el) => !el.dataset.revealBound && !el.closest("[data-no-reveal]") && (el.textContent?.trim().length ?? 0) > 0,
      );
      bigTitles.forEach((el) => {
        el.dataset.revealBound = "1";
        el.classList.add("word-split", "heading-shine");
        // Preserva children não-texto: só faz split se for texto puro
        const raw = el.textContent ?? "";
        if (el.children.length === 0) {
          const words = raw.split(/(\s+)/);
          el.textContent = "";
          let i = 0;
          words.forEach((w) => {
            if (w.trim() === "") {
              el.appendChild(document.createTextNode(w));
            } else {
              const span = document.createElement("span");
              span.className = "word";
              span.style.setProperty("--word-index", String(i++));
              span.textContent = w;
              el.appendChild(span);
            }
          });
        }
      });

      // 3) Textos menores: text-rise
      const smalls = Array.from(
        document.querySelectorAll<HTMLElement>("h3, h4, section p, section li, section a.reveal-text"),
      ).filter((el) => {
        if (el.dataset.revealBound) return false;
        if (el.closest("[data-no-reveal]")) return false;
        if (el.classList.contains("word-split")) return false;
        return (el.textContent?.trim().length ?? 0) > 0;
      });
      smalls.forEach((el) => {
        el.dataset.revealBound = "1";
        el.classList.add("text-reveal");
      });

      // 4) Imagens/mockups grandes (opt-in via .reveal-zoom já pronta)
      const zooms = Array.from(document.querySelectorAll<HTMLElement>(".reveal-zoom"))
        .filter((el) => !el.dataset.revealBound);
      zooms.forEach((el) => { el.dataset.revealBound = "1"; });

      const all: HTMLElement[] = [...blocks, ...bigTitles, ...smalls, ...zooms];

      if (all.length === 0) return;

      if (prefersReduced) {
        all.forEach((n) => n.classList.add("is-visible"));
        return;
      }

      // Stagger por seção
      const perSectionIndex = new WeakMap<HTMLElement, number>();
      [...smalls, ...bigTitles].forEach((el) => {
        const section = (el.closest("section") as HTMLElement) || document.body;
        const idx = perSectionIndex.get(section) ?? 0;
        perSectionIndex.set(section, idx + 1);
        if (!el.style.getPropertyValue("--reveal-delay")) {
          el.style.setProperty("--reveal-delay", `${Math.min(idx * 90, 700)}ms`);
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
        { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
      );

      all.forEach((n) => io.observe(n));

      // Failsafe: garante visibilidade após 2.2s independente do observer
      const failsafe = window.setTimeout(() => {
        all.forEach((n) => n.classList.add("is-visible"));
      }, 2200);

      return () => {
        io.disconnect();
        window.clearTimeout(failsafe);
      };
    };

    const cleanup = enhance();

    // Reaplica quando novos nós aparecem (rotas, listas, etc.)
    const mo = new MutationObserver(() => {
      enhance();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cleanup?.();
      mo.disconnect();
    };
  }, [selector]);
}
