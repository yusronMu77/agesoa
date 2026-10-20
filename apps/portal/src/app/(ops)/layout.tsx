import "../(validator)/console.css";

import type { ReactNode } from "react";

/** Console screens render their own shell (ConsoleShell via components/console/Consoles): it depends on page data. */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return children;
}
