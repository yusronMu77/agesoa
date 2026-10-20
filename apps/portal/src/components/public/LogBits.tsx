import { Activity, Building2, CircleCheck, CircleDashed, Cpu, ShieldCheck, TriangleAlert, User } from "lucide-react";
import type { Translate } from "@/lib/i18n/core";
import type { ActorCategory, ChainState } from "@/lib/publicview";
import { actorLabel } from "./text";

const ACTOR_ICONS = {
  agent: Cpu,
  validator: ShieldCheck,
  institution: Building2,
  citizen: User,
  system: Activity,
} as const;

/** Who decided: role chip with an icon and a text label (AI agent marked with a neutral chip icon, never sparkles). */
export function ActorChip({ t, category }: { t: Translate; category: ActorCategory }) {
  const Icon = ACTOR_ICONS[category];
  return (
    <span className={`pub-actor pub-actor--${category}`} data-actor={category}>
      <Icon aria-hidden size={14} strokeWidth={2} />
      {actorLabel(t, category)}
    </span>
  );
}

const CHAIN_ICONS = {
  intact: CircleCheck,
  mismatch: TriangleAlert,
  untrusted: TriangleAlert,
  unchecked: CircleDashed,
} as const;

/** Chain state of one entry: icon + text, never colour alone (TXT-PUB-002/003). */
export function ChainPill({ t, state }: { t: Translate; state: ChainState }) {
  const Icon = CHAIN_ICONS[state];
  return (
    <span className={`pub-chain pub-chain--${state}`} data-chain={state}>
      <Icon aria-hidden size={14} strokeWidth={2} />
      {t(`public.chainState.${state}`)}
    </span>
  );
}
