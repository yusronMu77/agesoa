import { ApiError } from "./api";
import { T } from "./copy";

/** A message for the reporter: never the raw text of a non-Error value (e.g. "[object GeolocationPositionError]"). */
export function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === null) return T["TXT-WIT-130"];
  if (err instanceof Error && err.message) return err.message;
  return T["TXT-WIT-133"];
}
