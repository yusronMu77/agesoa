import type { MessageKey } from "@/lib/i18n/messages";
import { ROUTES } from "@/lib/routes";

/**
 * Role switcher of the public header (the "Publik" Role chip): the reader can move to the other surfaces of
 * DESIGN-BRIEF §1. Every surface except the public one is entered through its own sign-in or registration page, so a
 * role offers exactly those two ways in; there is no menu mixing the surfaces' pages.
 */
export type SwitchRole = "public" | "validator" | "institution" | "ops";

export interface RoleEntry {
  role: SwitchRole;
  label: MessageKey;
  /** null for the public surface: the reader is already there. */
  signIn: string | null;
  register: string | null;
  note?: MessageKey;
}

export const ROLE_ENTRIES: readonly RoleEntry[] = [
  { role: "public", label: "common.role.public", signIn: null, register: null },
  { role: "validator", label: "common.role.validator", signIn: ROUTES.validatorSignIn, register: ROUTES.validatorRegister },
  {
    role: "institution",
    label: "common.role.organization",
    signIn: ROUTES.institutionSignIn,
    register: ROUTES.institutionRegister,
  },
  {
    role: "ops",
    label: "common.role.operator",
    signIn: ROUTES.opsSignIn,
    register: ROUTES.opsRegister,
    note: "common.roleSwitch.opsNote",
  },
];
