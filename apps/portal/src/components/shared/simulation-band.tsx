import {
  SimOrgBand as SharedSimOrgBand,
  SimulationBand as SharedSimulationBand,
} from "@agesoa/ui/components/simulation-band";

/** Shown on every page when demo_mode is on: the data on screen is synthetic. */
export function SimulationBand() {
  return (
    <SharedSimulationBand className="sim-band" role="status" data-testid="simulation-band">
      <p style={{ margin: 0 }}>
        SIMULATION — synthetic data for demonstration
      </p>
    </SharedSimulationBand>
  );
}

/** TXT-SIM-001: on every simulation screen (organizations), at the top, not dismissible. */
export function SimOrgBand() {
  return (
    <SharedSimOrgBand role="note" data-testid="sim-org-band">
      <span lang="id">SIMULASI – organisasi fiktif</span>
      <span className="muted"> · simulated organizations for the demo</span>
    </SharedSimOrgBand>
  );
}
