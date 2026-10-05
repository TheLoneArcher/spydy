"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function HeroSection() {
  return (
    <section className="container flex flex-col items-center justify-center gap-6 pb-8 pt-24 md:pt-32 lg:pt-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Build something{" "}
          <span className="text-primary">amazing</span>
        </h1>
        <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
          A modern web application built with Next.js 15, Supabase, and
          shadcn/ui. Fast, secure, and beautifully designed.
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex gap-4"
      >
        <Button render={<Link href="/sign-up" />} size="lg">
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button render={<Link href="/sign-in" />} variant="outline" size="lg">
          Sign In
        </Button>
      </motion.div>
    </section>
  )
}
