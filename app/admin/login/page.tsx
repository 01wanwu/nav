"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Github } from "lucide-react"

// 缓存设置数据
let settingsCache: any = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [siteName, setSiteName] = useState("Conan Nav")
  const [githubUrl, setGithubUrl] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      // 检查缓存
      const now = Date.now()
      if (settingsCache && (now - cacheTimestamp) < CACHE_DURATION) {
        if (settingsCache.siteName) setSiteName(settingsCache.siteName)
        if (settingsCache.githubUrl) setGithubUrl(settingsCache.githubUrl)
        return
      }

      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const settings = await res.json()
          settingsCache = settings
          cacheTimestamp = now
          if (settings.siteName) setSiteName(settings.siteName)
          if (settings.githubUrl) setGithubUrl(settings.githubUrl)
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      }
    }
    loadSettings()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        router.push("/admin/dashboard")
        router.refresh()
      } else {
        setError(data.error || "登录失败")
      }
    } catch (err) {
      setError("登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{siteName}</CardTitle>
          <CardDescription>
            输入您的账号和密码登录管理后台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>
          {githubUrl && (
            <div className="mt-6 flex justify-center">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-4 w-4" />
                <span>Star on GitHub</span>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
