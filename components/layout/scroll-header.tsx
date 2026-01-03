"use client"

import { useEffect, useState } from "react"
import { Header } from "./header"

interface ScrollHeaderProps {
  categories: Array<{
    id: string
    name: string
    slug: string
  }>
  siteName?: string
}

export function ScrollHeader({ categories, siteName }: ScrollHeaderProps) {
  const [activeCategory, setActiveCategory] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return

    const categorySlugs = categories.map((c) => c.slug)

    const observerOptions = {
      root: null,
      rootMargin: "-20% 0px -70% 0px", // 当元素在视口顶部区域时触发
      threshold: 0,
    }

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id
          const slug = id.replace("category-", "")
          setActiveCategory(slug)
        }
      })
    }

    const observer = new IntersectionObserver(handleIntersection, observerOptions)

    // 观察所有分类区块
    categorySlugs.forEach((slug) => {
      const element = document.getElementById(`category-${slug}`)
      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [categories])

  return <Header categories={categories} currentCategory={activeCategory} siteName={siteName} />
}
