import type { ReactNode } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import "./public.css";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
