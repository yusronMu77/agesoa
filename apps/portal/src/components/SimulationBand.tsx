import { Info } from "lucide-react";
import { getT } from "@/lib/i18n/server";

/**
 * Top band, not dismissible. `data` (public + operator, demo_mode on): the data on screen is synthetic.
 * `org` (validator + institution surfaces): TXT-SIM-001, the organizations and validators are fictional; the text is
 * the design's Indonesian wording in every language (it names the simulation, like a stamp).
 */
export async function SimulationBand({ variant = "data" }: { variant?: "data" | "org" }) {
  const { t } = await getT();
  return (
    <div
      className="sim-band"
      role={variant === "data" ? "status" : "note"}
      data-testid={variant === "data" ? "simulation-band" : "sim-org-band"}
    >
      <Info aria-hidden size={16} strokeWidth={2} />
      {variant === "data" ? (
        <p>{t("common.simulation.band")}</p>
      ) : (
        <p lang="id">SIMULASI – organisasi fiktif</p>
      )}
    </div>
  );
}
