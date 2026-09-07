"use client"

import { useState, useEffect } from "react"

// Favicon 服务类型
export type FaviconService = "favicon-im" | "bqb-cool" | "duckduckgo"

// Favicon 服务配置（name 供切换按钮展示，url 供前台拼图标地址）
export const FAVICON_SERVICES = {
  "favicon-im": {
    name: "favicon.im",
    url: (domain: string) => `https://favicon.im/${domain}`,
  },
  "bqb-cool": {
    name: "icon.bqb.cool",
    url: (domain: string) => `https://icon.bqb.cool?url=https://${domain}`,
  },
  duckduckgo: {
    name: "duckduckgo",
    url: (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  },
} as const

const STORAGE_KEY = "favicon-service"
const DEFAULT_SERVICE: FaviconService = "favicon-im"

// 获取初始服务
function getInitialService(): FaviconService {
  if (typeof window === "undefined") return DEFAULT_SERVICE

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in FAVICON_SERVICES) {
      return stored as FaviconService
    }
  } catch {
    // localStorage 不可用，使用默认值
  }
  return DEFAULT_SERVICE
}

// 设置服务
function setService(service: FaviconService) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, service)
    // 触发自定义事件，通知其他组件
    window.dispatchEvent(new CustomEvent("favicon-service-change", { detail: service }))
  } catch {
    // localStorage 不可用，忽略
  }
}

export function useFaviconService() {
  const [service, setServiceState] = useState<FaviconService>(DEFAULT_SERVICE)
  const [mounted, setMounted] = useState(false)

  // 客户端初始化
  useEffect(() => {
    setMounted(true)
    setServiceState(getInitialService())

    // 监听自定义事件
    const handleServiceChange = (e: Event) => {
      const customEvent = e as CustomEvent<FaviconService>
      setServiceState(customEvent.detail)
    }

    window.addEventListener("favicon-service-change", handleServiceChange)

    return () => {
      window.removeEventListener("favicon-service-change", handleServiceChange)
    }
  }, [])

  // 切换服务
  const changeService = (newService: FaviconService) => {
    setService(newService)
  }

  return {
    service: mounted ? service : DEFAULT_SERVICE,
    setService: changeService,
    mounted,
  }
}

// 获取 Favicon URL（直接访问第三方，仅服务端等场景使用）
export function getFaviconUrl(domain: string, service: FaviconService = DEFAULT_SERVICE): string {
  return FAVICON_SERVICES[service].url(domain)
}

// 允许走本地代理缓存的上游域名（与 /api/icon 白名单保持一致）
const PROXYABLE_HOSTS = new Set([
  "favicon.im",
  "icon.bqb.cool",
  "icons.duckduckgo.com",
  "www.google.com",
  "google.com",
  "gstatic.com",
  "www.gstatic.com",
])

// 构建本地代理地址：由服务端拉取并做磁盘/浏览器双层缓存
export function getProxiedFaviconUrl(domain: string, service: FaviconService = DEFAULT_SERVICE): string {
  return `/api/icon?domain=${encodeURIComponent(domain)}&s=${service}`
}

// 若 iconUrl 指向已知 favicon 服务，则改走本地代理；否则原样返回由浏览器直连
export function proxyIconUrlIfPossible(iconUrl: string): string {
  try {
    const parsed = new URL(iconUrl)
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && PROXYABLE_HOSTS.has(parsed.hostname)) {
      return `/api/icon?url=${encodeURIComponent(iconUrl)}`
    }
  } catch {
    // 解析失败按原样处理
  }
  return iconUrl
}
