import "../(validator)/console.css";

import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/ConsoleShell";

export default function InstitutionLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell surface="institution">{children}</ConsoleShell>;
}
