import { DecisionLogEntryView } from "@/components/log/DecisionLogEntry";

export { generateMetadata } from "@/components/log/DecisionLogEntry";
export const dynamic = "force-dynamic";

type Params = Promise<{ seq: string }>;

export default function LogEntryPage({ params }: { params: Params }) {
  return <DecisionLogEntryView params={params} />;
}
