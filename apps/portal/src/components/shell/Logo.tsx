import Link from "next/link";
import logoMark from "@/assets/logo-mark.png";

/** Logo mark + wordmark; links to the home page of the surface. */
export function Logo({ href = "/", label = "AGESOA", sub }: { href?: string; label?: string; sub?: string }) {
  return (
    <Link href={href} className="logo">
      <img src={logoMark.src} width={32} height={32} alt="" />
      <span className="logo__word">{label}</span>
      {sub ? <span className="logo__sub">{sub}</span> : null}
    </Link>
  );
}
