import { useEffect } from "react";

/**
 * Animações cinematográficas: aplica reveal em blocos `.reveal`,
 * text-rise em parágrafos/listas/h3-h4, word-split em h1/h2,
 * e brilho contínuo em títulos grandes.
 *
 * Importante para performance: usa UM único IntersectionObserver para toda a
 * página e um MutationObserver com debounce que é pausado enquanto o próprio
 * hook altera o DOM. Sem isso, cada mutação disparava um novo varrimento do
 * documento inteiro (loop infinito), travando a rolagem e esquentando o
 * aparelho no celular.
 */
export function useRevealOnScroll(selector = ".reveal") {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = prefersReduced
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                io?.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
        );

    let mo: MutationObserver | null = null;
    let scheduled = 0;
    let running = false;

    const observe = (el: HTMLElement) => {
      if (prefersReduced || !io) {
        el.classList.add("is-visible");
        return;
      }
      io.observe(el);
      // Failsafe individual: garante visibilidade mesmo se o observer falhar.
      window.setTimeout(() => el.classList.add("is-visible"), 2200);
    };

    const enhance = () => {
      running = true;
      mo?.disconnect();

      // 1) Blocos com classe .reveal explícita
      const blocks = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.dataset.revealBound,
      );

      // 2) Títulos grandes (h1, h2)
      const bigTitles = Array.from(document.querySelectorAll<HTMLElement>("h1, h2")).filter(
        (el) =>
          !el.dataset.revealBound &&
          !el.closest("[data-no-reveal]") &&
          (el.textContent?.trim().length ?? 0) > 0,
      );

      // 3) Textos menores
      const smalls = Array.from(
        document.querySelectorAll<HTMLElement>("h3, h4, section p, section li, section a.reveal-text"),
      ).filter((el) => {
        if (el.dataset.revealBound) return false;
        if (el.closest("[data-no-reveal]")) return false;
        if (el.classList.contains("word-split")) return false;
        return (el.textContent?.trim().length ?? 0) > 0;
      });

      // 4) Imagens/mockups (opt-in)
      const zooms = Array.from(document.querySelectorAll<HTMLElement>(".reveal-zoom")).filter(
        (el) => !el.dataset.revealBound,
      );

      blocks.forEach((el) => {
        el.dataset.revealBound = "1";
      });
      zooms.forEach((el) => {
        el.dataset.revealBound = "1";
      });

      bigTitles.forEach((el) => {
        el.dataset.revealBound = "1";
        if (el.children.length === 0) {
          el.classList.add("word-split");
          const raw = el.textContent ?? "";
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
        } else {
          el.classList.add("text-reveal");
        }
      });

      smalls.forEach((el) => {
        el.dataset.revealBound = "1";
        el.classList.add("text-reveal");
      });

      const all: HTMLElement[] = [...blocks, ...bigTitles, ...smalls, ...zooms];

      if (all.length > 0 && !prefersReduced) {
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
      }

      all.forEach(observe);

      running = false;
      mo?.observe(document.body, { childList: true, subtree: true });
    };

    const schedule = () => {
      if (running || scheduled) return;
      scheduled = window.setTimeout(() => {
        scheduled = 0;
        enhance();
      }, 200);
    };

    mo = new MutationObserver(schedule);
    enhance();

    return () => {
      if (scheduled) window.clearTimeout(scheduled);
      mo?.disconnect();
      io?.disconnect();
    };
  }, [selector]);
}
