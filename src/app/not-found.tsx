import Link from 'next/link';

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md"><p className="font-mono text-xs text-text-muted">404</p><h1 className="mt-2 font-serif text-3xl text-text">Page not found</h1><Link href="/" className="mt-5 inline-block text-sm text-accent underline">Return home</Link></div></main>;
}
