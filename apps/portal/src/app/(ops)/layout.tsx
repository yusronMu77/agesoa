import "../(validator)/console.css";

import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/ConsoleShell";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell surface="ops">{children}</ConsoleShell>;
}
