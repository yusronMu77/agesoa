import type { Metadata } from "next";
import { loadLogPage } from "@/features/decision-log/server/load-log";
import { LogListView } from "@/features/decision-log/views/log-list.view";
import { type PageProps, parseSeq } from "@/lib/page-props";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Decision log" };

export default async function LogPage({ searchParams }: PageProps) {
  const after = parseSeq((await searchParams).after) ?? 0;
  return <LogListView {...await loadLogPage(after)} />;
}
