import { useEffect } from "react";

/**
 * Adds `.is-visible` to every element matching `selector` inside `rootRef`
 * as it enters the viewport. Elements should have class `.reveal` and can
 * set `--reveal-delay` via inline style for staggering.
 */
export function useRevealOnScroll(selector = ".reveal") {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (nodes.length === 0) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [selector]);
}
