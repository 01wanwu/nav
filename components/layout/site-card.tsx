"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ExternalLink } from "lucide-react"

// 生成首字母图标（shadcn/ui 简洁风格）
function getInitialIcon(name: string) {
  // 提取首字符（中文或英文）
  return name.trim().charAt(0).toUpperCase()
}

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
  const [imageLoaded, setImageLoaded] = useState(false)
  const hasTriedLoad = useRef(false)

  // 使用 useMemo 优化 favicon URL 计算
  // 优先级：用户配置 > DuckDuckGo（在中国可访问）
  const iconSrc = useMemo(() => {
    if (site.iconUrl) return site.iconUrl

    try {
      const domain = new URL(site.url).hostname
      // 使用 DuckDuckGo Favicon API（在中国可访问）
      // DuckDuckGo 会自动解析 HTML meta 标签，比直接找 /favicon.ico 更准确
      return `https://icons.duckduckgo.com/ip3/${domain}.ico`
    } catch {
      return null
    }
  }, [site.iconUrl, site.url])

  // 计算首字母图标（作为 fallback）
  const initial = useMemo(() => getInitialIcon(site.name), [site.name])

  // 使用 useEffect + new Image() 预加载图片
  useEffect(() => {
    if (!iconSrc || hasTriedLoad.current) return

    hasTriedLoad.current = true
    const img = new Image()

    img.onload = () => {
      setImageLoaded(true)
    }

    img.onerror = () => {
      // 保持显示首字母图标
    }

    img.src = iconSrc
  }, [iconSrc])

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
      className="group block"
    >
      <Card className="relative h-full transition-colors hover:bg-muted">
        {/* 右上角外部链接图标（悬停时显示） */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>

        <CardHeader>
          <div className="flex items-center space-x-3">
            {iconSrc && imageLoaded ? (
              <img
                src={iconSrc}
                alt={`${site.name} 图标`}
                className="h-8 w-8 rounded"
              />
            ) : (
              <div
                className="h-8 w-8 rounded bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground"
                title={site.name}
              >
                {initial}
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
