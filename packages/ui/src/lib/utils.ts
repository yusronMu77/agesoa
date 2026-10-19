import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves conflicting Tailwind utilities (the `utils` alias of components.json). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
