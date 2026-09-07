"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"

// FLIP 列表重排动画：容器内带 [data-flip-id] 的元素在重排 commit 后，
// 按与上一帧的布局位置差做反向位移过渡（WAAPI），让拖拽排序平滑滑动而非瞬间跳变。
// 用 offsetLeft/offsetTop 度量布局位置，不受进行中的 transform 动画干扰；
// 仅在 active 期间测量，常态下零开销。
export function useFlipList<T extends HTMLElement = HTMLElement>(
  containerRef: RefObject<T | null>,
  active: boolean
) {
  const prevPos = useRef<Map<string, { left: number; top: number }> | null>(null)
  const anims = useRef(new Map<string, Animation>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!active || !container) {
      prevPos.current = null
      return
    }

    const next = new Map<string, { left: number; top: number }>()
    container.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((el) => {
      const id = el.dataset.flipId as string
      next.set(id, { left: el.offsetLeft, top: el.offsetTop })

      const prev = prevPos.current?.get(id)
      if (!prev) return
      const dx = prev.left - el.offsetLeft
      const dy = prev.top - el.offsetTop
      if (dx === 0 && dy === 0) return

      // 打断上一次未完成的位移动画，避免多次重排叠加错位
      anims.current.get(id)?.cancel()
      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }
      )
      anims.current.set(id, anim)
      anim.finished.finally(() => {
        if (anims.current.get(id) === anim) anims.current.delete(id)
      })
    })
    prevPos.current = next
  })

  return containerRef
}
