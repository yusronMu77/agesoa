import Link from "next/link";
import { ROUTES } from "@/configs/routes.config";
import { EvidenceLegend } from "../components/evidence-legend";

const EXPLORE = [
  {
    href: ROUTES.dashboard,
    title: "Public dashboard",
    text: "Cases by district on a map and every audit finding with its evidence status and validation.",
  },
  { href: ROUTES.log, title: "Decision log", text: "Every recorded decision in order, with its hash and the hash of the entry before it." },
  { href: ROUTES.status, title: "Service status", text: "Live readiness of the five backend services behind this portal." },
];

export function HomeView() {
  return (
    <>
      <h1>Find out why problems keep happening</h1>
      <p className="lead">
        Complaint channels record what happened. AGESOA, an agentic social audit platform, works out why it
        happened and why it keeps happening, so the same failure is not reported again next month.
      </p>
      <p>
        AI agents gather reports and signals and draft audit findings. People decide: every finding stays
        provisional until a quorum of human validators confirms it, and every decision is written to a public,
        hash-chained log that anyone can verify.
      </p>

      <ul className="card-grid" aria-label="Explore">
        {EXPLORE.map((item) => (
          <li key={item.href} className="card">
            <h2>
              <Link href={item.href}>{item.title}</Link>
            </h2>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>

      <EvidenceLegend />
    </>
  );
}
