"use client";

import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Callout as="section" tone="error" aria-labelledby="error-heading">
      <h2 id="error-heading">Something went wrong</h2>
      <p>This page could not be shown. Please try again.</p>
      <Button type="button" variant="secondary" onClick={() => reset()}>
        Try again
      </Button>
    </Callout>
  );
}
