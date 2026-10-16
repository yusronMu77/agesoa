"use client";

// Rendered when the root layout itself fails, e.g. the configuration is refused
// (DEMO_MODE=true with APP_ENV=prod). Must render its own <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem", color: "#2A1A18" }}>
        <main>
          <h1>AGESOA portal is unavailable</h1>
          <p>The portal could not start this page. Please try again later.</p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
