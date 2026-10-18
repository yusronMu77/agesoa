import Link from "next/link";
import { Logo } from "@agesoa/ui/components/logo";
import { ROUTES } from "@/configs/routes.config";
import { MAIN_NAV, SITE } from "@/configs/site.config";
import { NavLink } from "./nav-link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href={ROUTES.home} className="brand">
          <Logo tone="ink" size={28}>
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
    </header>
  );
}
