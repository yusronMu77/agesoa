/** Reading submitted forms in server actions. */

/** A form field as text ("" when missing or a file). */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Optional form text field: trimmed, empty → null. */
export function optionalField(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

/** A checkbox: true only when ticked. */
export function checkboxField(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}
