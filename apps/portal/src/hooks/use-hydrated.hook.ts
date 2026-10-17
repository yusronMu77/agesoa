"use client";

import { useEffect, useState } from "react";

/**
 * False on the server and in the first client render, true once React is attached. Use it to keep a control
 * disabled until its handlers exist (a form must not submit natively before that).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
