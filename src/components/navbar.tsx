import Link from "next/link"
import { Zap } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="font-bold">Spiderman</span>
        </Link>
        <nav className="flex flex-1 items-center justify-end space-x-2">
          <ThemeToggle />
          <Button render={<Link href="/sign-in" />} variant="default" size="sm">
            Sign In
          </Button>
        </nav>
      </div>
    </header>
  )
}
