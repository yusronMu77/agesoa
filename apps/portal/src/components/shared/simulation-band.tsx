/** Shown on every page when demo_mode is on: the data on screen is synthetic. */
export function SimulationBand() {
  return (
    <div className="sim-band" role="status" data-testid="simulation-band">
      <p style={{ margin: 0 }}>
        <span lang="id">SIMULASI</span>
        {" — "}synthetic data for demonstration
      </p>
    </div>
  );
}

/** TXT-SIM-001: on every simulation screen (organizations), at the top, not dismissible. */
export function SimOrgBand() {
  return (
    <p className="sim-inline sim-org-band" role="note" data-testid="sim-org-band">
      <span lang="id">SIMULASI – organisasi fiktif</span>
      <span className="muted"> · simulated organizations for the demo</span>
    </p>
  );
}
