import type { District, EvidenceKind, SharedPostInput } from "./api";
import type { Capability } from "./device";

/** A file picked or recorded on this device, before (and after) it is uploaded. */
export interface EvidenceItem {
  key: string;
  kind: EvidenceKind;
  blob: Blob;
  name: string;
  previewUrl: string;
  seconds?: number;
  /** Set once the service stored it, so a retry does not upload it twice. */
  evidenceId?: string;
}

export interface CaptureState {
  narrative: string;
  items: EvidenceItem[];
  /** Picked by hand or resolved from the approximate position; coordinates are never kept. */
  district: District | null;
  sharedPost: SharedPostInput | null;
  /** The draft on the service, once created. */
  reportId: string | null;
  /** Permissions the reporter refused for this report; the notice stays while they come back from SCR-003. */
  denied: Capability[];
}

export const EMPTY_CAPTURE: CaptureState = {
  narrative: "",
  items: [],
  district: null,
  sharedPost: null,
  reportId: null,
  denied: [],
};

export function newItem(kind: EvidenceKind, blob: Blob, name: string): EvidenceItem {
  return { key: crypto.randomUUID(), kind, blob, name, previewUrl: URL.createObjectURL(blob) };
}

/** A permission that works now is no longer refused: its notice goes away. */
export function withoutDenied(denied: Capability[], kind: Capability): Capability[] {
  return denied.filter((k) => k !== kind);
}

export function hasContent(state: CaptureState): boolean {
  return state.narrative.trim() !== "" || state.items.length > 0 || state.sharedPost !== null;
}
