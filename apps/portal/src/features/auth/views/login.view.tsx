import { Callout } from "@/components/ui/callout";
import type { AuthConfig } from "@/configs/env.config";
import { LoginForm } from "../components/login-form";
import { LOGIN_TEXT, loginAudience } from "../lib/login-audience";

/** SCR-023 / SCR-063: one sign-in page; the heading follows where the caller goes next. */
export function LoginView({ auth, next }: { auth: AuthConfig; next: string }) {
  const audience = loginAudience(next);
  const text = LOGIN_TEXT[audience];
  return (
    <>
      <h1>{text.title}</h1>
      <p className="muted">
        {text.intro} Reporters never need an account.
      </p>
      {auth.emulatorUrl ? (
        <Callout data-testid="emulator-note">
          Local environment: accounts live in the Firebase Auth emulator (seeded demo accounts only).
        </Callout>
      ) : null}
      <LoginForm auth={auth} next={next} allowSignup={audience === "registration"} />
    </>
  );
}
