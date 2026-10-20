import type { ReactNode } from "react";

/** Sign-in pages draw their own split layout (AuthShell), chosen by the surface they lead to. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
