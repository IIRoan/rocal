"use client";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Error – Solace</title>
        <main>
          <h1>Unable to load Solace</h1>
          <p>Try again. If the problem continues, reload the page.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
