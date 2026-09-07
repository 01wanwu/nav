"use client"

import { createContext, useContext, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { fetchPublicSettings } from "@/lib/client-settings"
import { pluginRegistry } from "./registry"
// react-markdown 全家桶体积可观，仅上传插件的 markdown 槽位使用：
// dynamic 拆出首屏 bundle，渲染 markdown 槽位时才加载
const MarkdownContent = dynamic(
  () => import("@/components/markdown-content").then(m => m.MarkdownContent),
  { ssr: false }
)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ClientPluginView, ManifestSlot } from "./types"

// 前台注入点：核心只挂载 <PluginHeaderSlot /> / <PluginFooterSlot /> 等插槽，
// 启用状态来自 /api/settings 下发的精简视图，内置插件组件取自注册表（bundle 内），
// 上传插件按 manifest 声明由 ManifestPluginRenderer 渲染

const ClientPluginsContext = createContext<ClientPluginView | null>(null)

// 服务端直出的插件初始状态：避免首帧按禁用布局、接口返回后再改变内容区宽度
export function ClientPluginsProvider({
  initialPlugins,
  children,
}: {
  initialPlugins: ClientPluginView
  children: React.ReactNode
}) {
  return (
    <ClientPluginsContext.Provider value={initialPlugins}>
      {children}
    </ClientPluginsContext.Provider>
  )
}

function useClientPlugins(): ClientPluginView {
  const initialPlugins = useContext(ClientPluginsContext)
  const [plugins, setPlugins] = useState<ClientPluginView>(
    () => initialPlugins || { builtinEnabledIds: [], uploaded: [] }
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      const settings = await fetchPublicSettings()
      if (!cancelled && settings.plugins) {
        setPlugins(settings.plugins)
      }
    }

    load()
    window.addEventListener("focus", load)
    return () => {
      cancelled = true
      window.removeEventListener("focus", load)
    }
  }, [])

  return plugins
}

// 内置插件启用状态查询（客户端装配点统一入口）
export function useBuiltinPluginEnabled(id: string): boolean {
  const plugins = useClientPlugins()
  return plugins.builtinEnabledIds.includes(id)
}

// ---------- 首页侧栏可见性协议 ----------

// homeSide 槽位（首页右侧栏）的「用户级」可见性协议：
// 站长级启停走插件开关，用户级显隐统一走 localStorage + 自定义事件，
// 核心布局据此决定是否为侧栏预留空间
const HOME_SIDE_VISIBLE_KEY = "poetry-visible"
const HOME_SIDE_EVENT = "poetry-visible-change"

export function useHomeSideVisible(enabled: boolean) {
  const [visible, setVisible] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(HOME_SIDE_VISIBLE_KEY)
    setVisible(saved === null ? true : saved === "true")
    setMounted(true)
  }, [])

  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem(HOME_SIDE_VISIBLE_KEY)
      setVisible(saved === null ? true : saved === "true")
    }
    window.addEventListener(HOME_SIDE_EVENT, sync)
    return () => window.removeEventListener(HOME_SIDE_EVENT, sync)
  }, [])

  const setUserVisible = (value: boolean) => {
    setVisible(value)
    localStorage.setItem(HOME_SIDE_VISIBLE_KEY, String(value))
    window.dispatchEvent(new CustomEvent(HOME_SIDE_EVENT))
  }

  return { visible: mounted && enabled && visible, mounted, setUserVisible }
}

// 是否存在启用中的 homeSide 插件（核心布局据此为右侧侧栏预留空间）
export function useHomeSideActive(): boolean {
  const plugins = useClientPlugins()
  return pluginRegistry.some(
    (def) => def.homeSideSlot && plugins.builtinEnabledIds.includes(def.id)
  )
}

// ---------- 上传插件通用渲染器（声明式四形态） ----------

function IframeSlotDialog({
  slot,
  name,
  open,
  onOpenChange,
}: {
  slot: ManifestSlot
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!slot.target) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(96vw,var(--plugin-iframe-w,880px))]">
        <DialogHeader>
          <DialogTitle>{slot.label || name}</DialogTitle>
          {slot.label && <DialogDescription className="sr-only">{name}</DialogDescription>}
        </DialogHeader>
        <iframe
          src={slot.target}
          // 沙箱：允许脚本/表单/弹窗，排除 allow-same-origin 以隔离宿主页
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full rounded-md border bg-background"
          style={{ height: `${slot.height ?? 640}px` }}
          title={slot.label || name}
        />
      </DialogContent>
    </Dialog>
  )
}

export function ManifestSlotView({
  slot,
  name,
  position,
}: {
  slot: ManifestSlot
  name: string
  position: "header" | "footer"
}) {
  const [iframeOpen, setIframeOpen] = useState(false)

  // header 槽位渲染 markdown 会破坏工具栏布局，按约定忽略
  if (position === "header" && slot.type === "markdown") return null

  if (slot.type === "markdown" && slot.content) {
    return (
      <div className="text-sm text-muted-foreground">
        <MarkdownContent content={slot.content} />
      </div>
    )
  }

  if (slot.type === "link" && slot.target) {
    return (
      <a
        href={slot.target}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {slot.label || name}
      </a>
    )
  }

  if (slot.type === "button" && slot.target) {
    return (
      <a
        href={slot.target}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={slot.label || name}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {slot.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.icon} alt="" className="h-4 w-4" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-sm font-medium">{(slot.label || name).slice(0, 2)}</span>
        )}
      </a>
    )
  }

  if (slot.type === "iframe" && slot.target) {
    return (
      <>
        <button
          type="button"
          aria-label={slot.label || name}
          onClick={() => setIframeOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {slot.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.icon} alt="" className="h-4 w-4" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-sm font-medium">{(slot.label || name).slice(0, 2)}</span>
          )}
        </button>
        <IframeSlotDialog
          slot={slot}
          name={name}
          open={iframeOpen}
          onOpenChange={setIframeOpen}
        />
      </>
    )
  }

  return null
}

// ---------- 注入点 ----------

// 通用内置插件槽：按位置渲染启用中插件的对应 slot 组件
export function PluginSlot({
  position,
}: {
  position: "headerTools" | "homeSide"
}) {
  const plugins = useClientPlugins()

  return (
    <>
      {pluginRegistry
        .filter(
          (def) =>
            plugins.builtinEnabledIds.includes(def.id) &&
            (position === "headerTools" ? def.headerToolsSlot : def.homeSideSlot)
        )
        .map((def) => {
          const Slot =
            position === "headerTools" ? def.headerToolsSlot! : def.homeSideSlot!
          return <Slot key={def.id} />
        })}
    </>
  )
}

export function PluginHeaderSlot() {
  const plugins = useClientPlugins()

  return (
    <>
      {pluginRegistry
        .filter(
          (def) =>
            plugins.builtinEnabledIds.includes(def.id) && def.headerSlot
        )
        .map((def) => {
          const Slot = def.headerSlot!
          return <Slot key={def.id} />
        })}
      {plugins.uploaded
        .filter((p) => p.slots?.header)
        .map((p) => (
          <ManifestSlotView key={p.id} slot={p.slots!.header!} name={p.name} position="header" />
        ))}
    </>
  )
}

export function PluginFooterSlot() {
  const plugins = useClientPlugins()

  return (
    <>
      {pluginRegistry
        .filter(
          (def) =>
            plugins.builtinEnabledIds.includes(def.id) && def.footerSlot
        )
        .map((def) => {
          const Slot = def.footerSlot!
          return <Slot key={def.id} />
        })}
      {plugins.uploaded
        .filter((p) => p.slots?.footer)
        .map((p) => (
          <ManifestSlotView key={p.id} slot={p.slots!.footer!} name={p.name} position="footer" />
        ))}
    </>
  )
}
