import { notFound, redirect } from "next/navigation";
import { loadConfig } from "@/lib/config";
import { getDocument, type PublicFinding } from "@/lib/readmodel";

// `/findings/<finding id>` (DESIGN-BRIEF §1 public paths): opens the audit trail of the finding's case.
export const dynamic = "force-dynamic";

export default async function FindingAlias({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const finding = await getDocument<PublicFinding>(loadConfig(), `public_findings/${encodeURIComponent(id)}`);
  if (!finding.ok) throw new Error(`read model unavailable (${finding.error})`);
  if (!finding.data?.case_id) notFound();
  redirect(`/cases/${encodeURIComponent(finding.data.case_id)}`);
}
