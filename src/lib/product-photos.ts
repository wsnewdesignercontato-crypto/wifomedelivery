/** Keep the cover first; promote the first remaining photo when the cover is removed. */
export function productPhotos(main?: string | null, extras?: readonly string[] | null): string[] {
  return [
    ...new Set(
      [main, ...(extras ?? [])]
        .map((value) => value?.trim())
        .filter((value): value is string => !!value),
    ),
  ].slice(0, 3);
}
