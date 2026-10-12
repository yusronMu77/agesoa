"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="callout callout--error" aria-labelledby="error-heading">
      <h2 id="error-heading">Something went wrong</h2>
      <p>This page could not be shown. Please try again.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
