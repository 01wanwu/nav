"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Globe } from "lucide-react"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  category?: {
    name: string
  }
}

interface SiteCardProps {
  site: Site
}

export function SiteCard({ site }: SiteCardProps) {
  const [clicked, setClicked] = useState(false)

  // 使用 useMemo 优化 favicon URL 计算
  const iconSrc = useMemo(() => {
    if (site.iconUrl) return site.iconUrl

    try {
      const domain = new URL(site.url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    } catch {
      return null
    }
  }, [site.iconUrl, site.url])

  const handleClick = () => {
    // 使用 sendBeacon 异步记录访问，不阻塞页面跳转
    if (navigator.sendBeacon) {
      const data = JSON.stringify({ siteId: site.id })
      navigator.sendBeacon('/api/visit', new Blob([data], { type: 'application/json' }))
    }
    setClicked(true)
  }

  return (
    <Link
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label={`访问 ${site.name}`}
    >
      <Card className="h-full transition-colors hover:bg-muted">
        <CardHeader>
          <div className="flex items-center space-x-3">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt={`${site.name} 图标`}
                className="h-8 w-8 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <CardTitle className="text-lg">{site.name}</CardTitle>
          </div>
          <CardDescription className="mt-2 line-clamp-2">
            {site.description}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}
