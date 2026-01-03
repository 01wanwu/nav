"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import Link from "next/link"
import { Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminHeader() {
  return (
    <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-end px-6">
        <div className="flex items-center gap-1">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <Home className="h-5 w-5" />
              <span className="sr-only">返回前台</span>
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
