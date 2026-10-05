"use client"

import { motion } from "motion/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Zap, Palette } from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description:
      "Built on Next.js 15 with the App Router for optimal performance and instant page loads.",
  },
  {
    icon: Shield,
    title: "Secure by Default",
    description:
      "Supabase authentication with cookie-based sessions and middleware protection.",
  },
  {
    icon: Palette,
    title: "Beautiful UI",
    description:
      "Crafted with shadcn/ui components and Tailwind CSS. Dark mode included.",
  },
]

export function FeaturesSection() {
  return (
    <section className="container py-16 md:py-24">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * (index + 1) }}
          >
            <Card className="h-full">
              <CardHeader>
                <feature.icon className="h-10 w-10 text-primary mb-2" />
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
