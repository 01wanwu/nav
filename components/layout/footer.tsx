"use client"

import { useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"

// 缓存设置数据，避免每次页面切换都重新加载
let settingsCache: any = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

// 获取动态版权信息
function getDefaultCopyright(): string {
  const year = new Date().getFullYear()
  return `© ${year} Conan Nav. All rights reserved.`
}

export function Footer() {
  const [settings, setSettings] = useState<{
    showFooter: boolean
    footerCopyright: string
    footerLinks: Array<{ name: string; url: string }>
    showAdminLink: boolean
    showIcp: boolean
    icpNumber: string | null
    icpLink: string | null
  } | null>(null)

  useEffect(() => {
    async function loadSettings() {
      // 检查缓存
      const now = Date.now()
      if (settingsCache && (now - cacheTimestamp) < CACHE_DURATION) {
        const data = settingsCache
        setSettings({
          showFooter: data.showFooter ?? true,
          footerCopyright: data.footerCopyright || getDefaultCopyright(),
          footerLinks: data.footerLinks || [],
          showAdminLink: data.showAdminLink ?? true,
          showIcp: data.showIcp ?? false,
          icpNumber: data.icpNumber || null,
          icpLink: data.icpLink || null,
        })
        return
      }

      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const data = await res.json()
          settingsCache = data
          cacheTimestamp = now
          setSettings({
            showFooter: data.showFooter ?? true,
            footerCopyright: data.footerCopyright || getDefaultCopyright(),
            footerLinks: data.footerLinks || [],
            showAdminLink: data.showAdminLink ?? true,
            showIcp: data.showIcp ?? false,
            icpNumber: data.icpNumber || null,
            icpLink: data.icpLink || null,
          })
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      }
    }
    loadSettings()
  }, [])

  // 如果设置为不显示底部，返回 null
  if (settings && !settings.showFooter) {
    return null
  }

  return (
    <footer className="w-full border-t bg-background px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl py-6">
        <div className="flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
          <div className="flex flex-col items-center space-y-1 sm:items-start">
            <p className="text-sm text-muted-foreground">
              {settings?.footerCopyright || getDefaultCopyright()}
            </p>
            {/* 备案信息 */}
            {settings?.showIcp && settings.icpNumber && (
              <p className="text-xs text-muted-foreground">
                {settings.icpLink ? (
                  <a
                    href={settings.icpLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground"
                  >
                    {settings.icpNumber}
                  </a>
                ) : (
                  <span>{settings.icpNumber}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-end">
            {/* 友情链接 */}
            {settings?.footerLinks && settings.footerLinks.length > 0 && (
              <>
                {settings.footerLinks.map((link, index) => (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {link.name}
                  </a>
                ))}
                <Separator orientation="vertical" className="h-4" />
              </>
            )}
            {/* 管理后台链接 - 根据设置显示或隐藏 */}
            {settings?.showAdminLink && (
              <a
                href="/admin"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                管理后台
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
