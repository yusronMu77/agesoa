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
