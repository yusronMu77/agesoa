import "./console.css";

import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/ConsoleShell";

export default function ValidatorLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell surface="validator">{children}</ConsoleShell>;
}
