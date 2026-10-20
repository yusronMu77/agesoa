import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import { registerOrganization } from "./organizations";
import { decide, listValidationRequests } from "./trust";

const config = loadConfig({});

function stub(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

const sent = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

describe("validator calls to trust (SCR-020/022)", () => {
  test("needs_evidence is posted with its note; the answer carries state and replaced", async () => {
    const { fetchImpl, calls } = stub(200, {
      finding_id: "F-1",
      decision: "needs_evidence",
      counted: true,
      replaced: false,
      quorum_reached: false,
      outcome: null,
      state: "needs_evidence",
      quorum: { outcome: "pending", reason: "", approvals: 0, rejections: 0, evidence_requests: 1 },
    });
    const result = await decide(
      config,
      "tok",
      "F 1",
      { decision: "needs_evidence", note: "Foto lokasi kedua", conflict: false, confidence: 0.7 },
      { fetchImpl },
    );
    expect(calls[0].url).toBe("http://localhost:8003/v1/validation-requests/F%201/decisions");
    expect(calls[0].init?.method).toBe("POST");
    expect(sent(calls[0].init)).toEqual({ decision: "needs_evidence", note: "Foto lokasi kedua", conflict: false, confidence: 0.7 });
    expect(result.ok && result.data.state).toBe("needs_evidence");
    expect(result.ok && result.data.quorum.evidence_requests).toBe(1);
  });

  test("a 409 (asked twice, or changing a final decision) is returned, not thrown", async () => {
    const { fetchImpl } = stub(409, { detail: "you already decided on this finding" });
    const result = await decide(config, "tok", "F-1", { decision: "approve", note: "", conflict: false, confidence: null }, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  test("the queue keeps deadline, state, evidence requests and my decision", async () => {
    const item = { finding_id: "F-1", deadline_at: "2026-10-18T03:00:00Z", state: "needs_evidence", evidence_requests: 1, my_decision: null };
    const { fetchImpl, calls } = stub(200, [item]);
    const result = await listValidationRequests(config, "tok", { fetchImpl });
    expect(calls[0].url).toBe("http://localhost:8003/v1/validation-requests");
    expect(result.ok && result.data[0]).toEqual(item as never);
  });
});

describe("organization registration (SCR-060)", () => {
  test("the private contact e-mail is sent with the organization", async () => {
    const { fetchImpl, calls } = stub(201, { organization_id: "ORG-1", contact_email: "kontak@layanan.example" });
    const result = await registerOrganization(
      config,
      "tok",
      {
        name: "Badan Layanan",
        kind: "agency",
        domain: "layanan.example",
        region: { regency_name: "Kab. A" },
        contact_email: "kontak@layanan.example",
      },
      { fetchImpl },
    );
    expect(calls[0].url).toBe("http://localhost:8003/v1/organizations");
    expect(sent(calls[0].init).contact_email).toBe("kontak@layanan.example");
    expect(result.ok).toBe(true);
  });
});
