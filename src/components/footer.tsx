export function Footer() {
  return (
    <footer className="border-t py-6">
      <div className="container flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <p>Built with Next.js 15, Supabase, and shadcn/ui.</p>
        <p>&copy; {new Date().getFullYear()} Spiderman. All rights reserved.</p>
      </div>
    </footer>
  )
}
