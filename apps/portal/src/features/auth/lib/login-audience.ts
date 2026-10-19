/** Who a sign-in page is for, read from where the caller wants to go next. */

import { ROUTES } from "@/configs/routes.config";

export type LoginAudience = "organization" | "operator" | "registration" | "validator";

export function loginAudience(next: string): LoginAudience {
  if (next.startsWith(ROUTES.organizations)) return "organization";
  if (next.startsWith(ROUTES.ops)) return "operator";
  if (next.startsWith(ROUTES.validatorRegister)) return "registration";
  return "validator";
}

export const LOGIN_TEXT: Record<LoginAudience, { title: string; intro: string }> = {
  organization: {
    title: "Organization sign-in",
    intro: "Newsrooms and agencies manage their organization and domain verification here.",
  },
  operator: { title: "Operator sign-in", intro: "Operators watch the agents and services at work." },
  registration: { title: "Become a validator", intro: "Validators review audit findings before they become final." },
  validator: { title: "Validator sign-in", intro: "Validators review audit findings before they become final." },
};
