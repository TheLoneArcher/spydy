"use client"

import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { motion } from "motion/react"
import { LogOut, Users, Activity, CreditCard } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import { Zap } from "lucide-react"
import Link from "next/link"

const stats = [
  { title: "Total Users", value: "1,234", icon: Users, change: "+12%" },
  { title: "Active Now", value: "42", icon: Activity, change: "+3%" },
  { title: "Revenue", value: "$12.4k", icon: CreditCard, change: "+8%" },
]

const recentActivity = [
  { id: 1, action: "User signed up", status: "completed", date: "2 min ago" },
  { id: 2, action: "Payment received", status: "completed", date: "15 min ago" },
  { id: 3, action: "Report generated", status: "pending", date: "1 hour ago" },
  { id: 4, action: "New deployment", status: "completed", date: "3 hours ago" },
  { id: 5, action: "Database backup", status: "pending", date: "5 hours ago" },
]

export function DashboardContent({ user }: { user: User }) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success("Signed out successfully")
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Dashboard Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-bold">Spiderman</span>
          </Link>
          <div className="flex flex-1 items-center justify-end space-x-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="sm" />}
              >
                {user.email}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Dashboard Body */}
      <main className="container flex-1 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="mb-6 text-3xl font-bold">Dashboard</h1>

          {/* Stats Cards */}
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * (index + 1) }}
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-green-500">{stat.change}</span> from
                      last month
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Recent Activity Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.action}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{item.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}
