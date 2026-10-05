'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md border border-critical/30 bg-surface p-6"><h1 className="font-serif text-2xl text-text">Something went wrong</h1><p className="mt-2 text-sm text-text-muted">The page could not load. Try again.</p><button onClick={reset} className="mt-5 border border-accent bg-accent px-3 py-2 text-sm text-accent-foreground">Try again</button></div></main>;
}
