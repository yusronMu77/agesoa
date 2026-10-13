import type { District, EvidenceKind, SharedPostInput } from "./api";

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
}

export const EMPTY_CAPTURE: CaptureState = {
  narrative: "",
  items: [],
  district: null,
  sharedPost: null,
  reportId: null,
};

export function newItem(kind: EvidenceKind, blob: Blob, name: string): EvidenceItem {
  return { key: crypto.randomUUID(), kind, blob, name, previewUrl: URL.createObjectURL(blob) };
}

export function hasContent(state: CaptureState): boolean {
  return state.narrative.trim() !== "" || state.items.length > 0 || state.sharedPost !== null;
}
