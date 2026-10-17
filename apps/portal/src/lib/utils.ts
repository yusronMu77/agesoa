/** Joins class names, skipping empty ones (the `utils` alias of components.json). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
