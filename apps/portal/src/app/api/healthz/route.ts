import { ConfigError, loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Liveness of the portal itself (does not call the backend services). */
export function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    const config = loadConfig();
    return Response.json(
      {
        service: "portal",
        status: "ok",
        release: config.release,
        environment: config.appEnv,
        demo_mode: config.demoMode,
      },
      { headers },
    );
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return Response.json({ service: "portal", status: "error", error: error.message }, { status: 500, headers });
  }
}
