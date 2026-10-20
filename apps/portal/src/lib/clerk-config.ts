/** Clerk is opt-in; devenv keeps Identity Platform until development keys are provisioned. */
export function clerkEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim());
}

/** Read at request time so a single Docker image can receive its public key at deployment. */
export function clerkPublishableKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
}
