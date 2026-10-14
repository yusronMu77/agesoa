/** TXT-SIM-001: on every simulation screen (organizations), at the top, not dismissible. */
export function SimOrgBand() {
  return (
    <p className="sim-inline sim-org-band" role="note" data-testid="sim-org-band">
      <span lang="id">SIMULASI – organisasi fiktif</span>
      <span className="muted"> · simulated organizations for the demo</span>
    </p>
  );
}
