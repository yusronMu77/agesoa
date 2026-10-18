import Link from "next/link";
import { Logo } from "@agesoa/ui/components/logo";
import { ChevronDownIcon, GlobeIcon, UsersIcon } from "@/components/shared/icons";
import { ROUTES } from "@/configs/routes.config";
import { ACCOUNT_NAV, MAIN_NAV, SITE } from "@/configs/site.config";
import { NavLink } from "./nav-link";

/** Penpot SCR-040 header: brand and the public sections left; language and the role menu right. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__start">
          <Link href={ROUTES.home} className="brand">
            <Logo tone="ink" size={32}>
              {SITE.name}
            </Logo>
          </Link>
          <nav className="nav" aria-label="Main">
            <ul>
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="site-header__end">
          {/* The portal is English only for now: the language is shown, not offered as a choice. */}
          <span className="lang-pill" title="English (the only language of this prototype)">
            <GlobeIcon />
            <span aria-hidden="true">EN</span>
            <span className="sr-only">Language: English</span>
          </span>
          <details className="role-menu">
            <summary className="role-chip">
              <UsersIcon />
              Public
              <ChevronDownIcon size={14} />
            </summary>
            <nav aria-label="Validators, organizations and operators">
              <ul>
                {ACCOUNT_NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
