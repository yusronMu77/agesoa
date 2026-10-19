import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadLogEntry } from "@/features/decision-log/server/load-log";
import { LogEntryView } from "@/features/decision-log/views/log-entry.view";
import { type PageProps, parseSeq } from "@/lib/page-props";

export const dynamic = "force-dynamic";

type Props = PageProps<{ seq: string }>;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const seq = parseSeq((await params).seq);
  return { title: seq ? `Decision #${seq}` : "Decision" };
}

export default async function LogEntryPage({ params }: Props) {
  const seq = parseSeq((await params).seq);
  if (seq === undefined || seq < 1) notFound();
  return <LogEntryView {...await loadLogEntry(seq)} />;
}
