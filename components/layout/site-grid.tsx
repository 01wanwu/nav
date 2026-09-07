"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { GripVertical, RotateCcw } from "lucide-react"
import { SiteCard, type SiteItemProps } from "./site-card"
import { useCardDensity, type CardDensity } from "@/hooks/use-card-density"
import { useLocalSiteOrder } from "@/hooks/use-local-site-order"
import { useFlipList } from "@/hooks/use-flip-list"

// 卡片较重（图标、Tooltip、弹窗挂载点），拖拽实时重排时每帧都会重渲染网格，
// memo 掉未变化的卡片，只让外层轻量包装 div 参与 diff
const MemoSiteCard = memo(SiteCard)

interface SiteGridProps {
  sites: SiteItemProps[]
  className?: string
  // 传入分类 id 时启用本地拖拽排序：拖拽结果仅保存在浏览器 localStorage
  categoryId?: string
  enableDrag?: boolean
}

export function SiteGrid({
  sites,
  className = "",
  categoryId,
  enableDrag = false,
}: SiteGridProps) {
  const { isCompact, density, mounted: densityMounted } = useCardDensity()
  const t = useTranslations("siteOrder")
  const { orderedSites, hasCustomOrder, saveOrder, resetOrder } =
    useLocalSiteOrder(categoryId, sites)

  // 图鉴模式只替换首页正文；搜索结果仍使用标准卡片网格
  const currentDensity: CardDensity =
    densityMounted && density !== "overview" ? density : "standard"

  const dragEnabled = enableDrag && Boolean(categoryId) && orderedSites.length > 1
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // 拖拽中的实时预览顺序（仅本地视觉反馈，落定才写入 localStorage）
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  const lastOverIdRef = useRef<string | null>(null)
  const gridRef = useFlipList(useRef<HTMLDivElement>(null), draggedId !== null)

  // 入场动画只在首帧播放一次：重排会移动 DOM 节点导致 CSS 动画重放，
  // 表现为每次排序全部卡片重新淡入一遍（卡顿感的主要来源），结束后移除动画类
  const [entryDone, setEntryDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setEntryDone(true), 700)
    return () => clearTimeout(timer)
  }, [])

  // 拖拽预览顺序叠加在本地顺序之上
  const visibleSites = useMemo(() => {
    if (!previewOrder) return orderedSites
    const byId = new Map(orderedSites.map(s => [s.id, s]))
    return previewOrder.map(id => byId.get(id)).filter(Boolean) as typeof orderedSites
  }, [orderedSites, previewOrder])

  const handleDragStart = (siteId: string, e: React.DragEvent) => {
    if (!dragEnabled) return
    e.dataTransfer.effectAllowed = "move"
    // Firefox 需要 dataTransfer 有内容才允许发起拖拽
    e.dataTransfer.setData("text/plain", siteId)
    lastOverIdRef.current = null
    setDraggedId(siteId)
  }

  // 拖到其他卡片上时立即实时重排（同一卡片内反复触发的 dragover 直接跳过）
  const handleDragOver = (targetId: string, e: React.DragEvent) => {
    if (!dragEnabled || !draggedId) return
    e.preventDefault()
    if (targetId === draggedId || lastOverIdRef.current === targetId) return
    lastOverIdRef.current = targetId

    const current = previewOrder ?? orderedSites.map(s => s.id)
    const from = current.indexOf(draggedId)
    const to = current.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPreviewOrder(next)
  }

  // 落定：无论在哪个卡片上松手（dragEnd 总会触发），提交当前预览顺序
  const handleDragEnd = () => {
    lastOverIdRef.current = null
    setDraggedId(null)
    if (previewOrder) saveOrder(previewOrder)
    setPreviewOrder(null)
  }

  return (
    <div className={className || undefined}>
      {hasCustomOrder && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={resetOrder}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {t("resetOrder")}
          </button>
        </div>
      )}
      <div
        ref={gridRef}
        className={
          currentDensity === "compact"
            ? `grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 transition-all duration-300 ease-spring`
            : `grid auto-rows-[76px] grid-cols-1 content-start gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 transition-all duration-300 ease-spring`
        }
      >
        {visibleSites.map((site, index) => (
          <div
            key={site.id}
            data-flip-id={site.id}
            draggable={dragEnabled}
            onDragStart={(e) => handleDragStart(site.id, e)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(site.id, e)}
            onDrop={(e) => dragEnabled && e.preventDefault()}
            style={{ animationDelay: entryDone ? undefined : `${Math.min(index * 20, 240)}ms` }}
            className={`group relative ${!entryDone ? "animate-fade-in-up" : ""} ${draggedId === site.id ? "opacity-40" : ""}`}
          >
            {dragEnabled && (
              <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded bg-background/80 p-0.5 text-muted-foreground/60 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            <MemoSiteCard site={site} density={currentDensity} dragEnabled={dragEnabled} />
          </div>
        ))}
      </div>
    </div>
  )
}
