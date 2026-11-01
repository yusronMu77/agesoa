import type { MessageKey } from "@/lib/i18n/messages";
import { ROUTES } from "@/lib/routes";

/**
 * Role switcher of the public header (the "Publik" Role chip): the reader can move to the other surfaces of
 * DESIGN-BRIEF §1. Every surface except the public one is entered through its own sign-in or registration page, so a
 * role offers exactly those two ways in; there is no menu mixing the surfaces' pages.
 */
export type SwitchRole = "public" | "validator" | "institution" | "ops";
export type ConsoleRole = Exclude<SwitchRole, "public">;

export interface RoleEntry {
  role: SwitchRole;
  label: MessageKey;
  /** null for the public surface: the reader is already there. */
  signIn: string | null;
  register: string | null;
  /** The console a signed-in holder of the role opens; null for the public surface. */
  home: string | null;
  note?: MessageKey;
}

/** ID token claim of each console role (custom claims set by trust, agesoa_platform.auth ROLE_CLAIMS). */
export const ROLE_CLAIM: Record<ConsoleRole, string> = { validator: "validator", institution: "org_admin", ops: "operator" };

/** The console roles a token's claims name (claim set to true). */
export function claimedRoles(claims: Record<string, unknown> | null): ConsoleRole[] {
  return (Object.keys(ROLE_CLAIM) as ConsoleRole[]).filter((role) => claims?.[ROLE_CLAIM[role]] === true);
}

export const ROLE_ENTRIES: readonly RoleEntry[] = [
  { role: "public", label: "common.role.public", signIn: null, register: null, home: null },
  {
    role: "validator",
    label: "common.role.validator",
    signIn: ROUTES.validatorSignIn,
    register: ROUTES.validatorRegister,
    home: ROUTES.validator,
  },
  {
    role: "institution",
    label: "common.role.organization",
    signIn: ROUTES.institutionSignIn,
    register: ROUTES.institutionRegister,
    home: ROUTES.institution,
  },
  {
    role: "ops",
    label: "common.role.operator",
    signIn: ROUTES.opsSignIn,
    register: ROUTES.opsRegister,
    home: ROUTES.ops,
    note: "common.roleSwitch.opsNote",
  },
];
