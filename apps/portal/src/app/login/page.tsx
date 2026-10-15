import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const config = loadConfig();
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/validate";
  const organizations = next.startsWith("/organizations");
  const operator = next.startsWith("/ops");
  const registering = next.startsWith("/validators/register");
  return (
    <>
      <h1>
        {organizations
          ? "Organization sign-in"
          : operator
            ? "Operator sign-in"
            : registering
              ? "Become a validator"
              : "Validator sign-in"}
      </h1>
      <p className="muted">
        {organizations
          ? "Newsrooms and agencies manage their organization and domain verification here."
          : operator
            ? "Operators watch the agents and services at work."
            : "Validators review audit findings before they become final."}{" "}
        Reporters never need an account.
      </p>
      {config.auth.emulatorUrl ? (
        <p className="callout" data-testid="emulator-note">
          Local environment: accounts live in the Firebase Auth emulator (seeded demo accounts only).
        </p>
      ) : null}
      <LoginForm auth={config.auth} next={next} allowSignup={registering} />
    </>
  );
}
