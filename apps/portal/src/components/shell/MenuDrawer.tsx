"use client";

import { Menu, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * A header's sections and tools (the public header, or a console's sidebar). On wide screens they sit in place; on
 * phones (≤ 600 px, globals.css) they move into a drawer opened by the menu button. The drawer is a native popover,
 * like the language picker and the role switcher, so it opens without JavaScript and closes on Escape or a tap
 * outside; the picker and switcher dialogs open above it. A client-side navigation keeps the shell mounted, so a tap
 * on any link in the drawer closes it (also the link of the page already open).
 */
export function MenuDrawer({ variant, children }: { variant: "public" | "console"; children: ReactNode }) {
  const t = useT();
  const id = `${useId()}-menu`;

  return (
    <>
      <button type="button" className="menu-drawer__toggle" popoverTarget={id} data-testid={`${variant}-menu-toggle`}>
        <Menu aria-hidden size={24} strokeWidth={2} />
        <span className="sr-only">{t("nav.menu.open")}</span>
      </button>
      <div
        id={id}
        popover="auto"
        className={`menu-drawer menu-drawer--${variant}`}
        data-testid={`${variant}-menu`}
        onClick={(e) => {
          if ((e.target as Element).closest("a[href]")) e.currentTarget.hidePopover();
        }}
      >
        <button type="button" className="menu-drawer__close" popoverTarget={id} popoverTargetAction="hide">
          <X aria-hidden size={24} strokeWidth={2} />
          <span className="sr-only">{t("nav.menu.close")}</span>
        </button>
        {children}
      </div>
    </>
  );
}
