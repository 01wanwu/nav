"use client"

import { useState, useEffect, useRef } from "react"
import { useFlipList } from "@/hooks/use-flip-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, FieldLabel } from "@/components/ui/field"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus, Pencil, Trash2, Power, Loader2, RotateCcw, Pin, PinOff, ExternalLink, Globe, Search, Activity, Square, ArrowUp, ArrowDown, ChevronUp, ChevronDown, GripVertical } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SiteFormDialog } from "@/components/admin/site-form-dialog"
import { getSitesWithPagination, deleteSite, toggleSitePublish, toggleSitePin, getCategoriesForFilter, checkSiteHealth, getSiteIdsForHealthCheck, getCategorySiteOrder, updateSitesOrder } from "@/lib/actions"
import { fetchPublicSettings } from "@/lib/client-settings"
import { toast } from "sonner"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  // site-submission 插件字段（管理员创建时为空）
  submitterContact?: string | null
  submitterIp?: string | null
  categoryId: string
  isPublished: boolean
  isPinned?: boolean
  order: number
  category?: {
    id: string
    name: string
  } | null
  detailContent?: string | null
  hasDetail?: boolean
  healthStatus?: string
  lastHttpStatus?: number | null
  latencyMs?: number | null
  lastCheckedAt?: Date | string | null
  createdAt: Date
  updatedAt: Date
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function AdminSitesPage() {
  const t = useTranslations("admin.sites")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null)

  // 筛选状态
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  // site-submission 插件：来源筛选（仅插件启用时显示）
  const [filterSubmitter, setFilterSubmitter] = useState<string>("all")
  const [submissionEnabled, setSubmissionEnabled] = useState(false)

  // 排序状态：默认=置顶优先+手动 order；health=测活异常优先；createdAt=添加时间
  const [sortBy, setSortBy] = useState<"default" | "health" | "createdAt">("default")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // 搜索状态
  const [searchKeyword, setSearchKeyword] = useState("")
  const isFirstSearch = useRef(true)

  // 分类内拖拽排序：仅当选中了单一分类、按默认排序查看且无搜索/其他筛选时启用，
  // 保证拖拽结果与「分类下站点显示顺序」一一对应
  const dragOrderEnabled =
    filterCategory !== "all" &&
    sortBy === "default" &&
    filterStatus === "all" &&
    (!submissionEnabled || filterSubmitter === "all") &&
    !searchKeyword.trim()
  const [draggedSiteId, setDraggedSiteId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  // 拖拽实时重排的辅助状态（避免在 dragover/dragenter 高频事件里频繁 setState）
  const dragMovedRef = useRef(false)
  const lastOverIdRef = useRef<string | null>(null)
  // 发起拖拽时的可见列表快照：实时重排会持续改写 sites，
  // 落库时需要用「原始顺序 → 底册位置」的映射还原完整底册
  const dragStartOrderRef = useRef<Site[]>([])
  // 跨页拖拽：被拖行不在当前页时，悬停行仅作为落点指示（无法页内实时重排）
  const [crossPageTargetId, setCrossPageTargetId] = useState<string | null>(null)
  const edgeFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flippingRef = useRef(false)
  const dragTableRef = useFlipList(useRef<HTMLDivElement>(null), draggedSiteId !== null)

  // 跨页拖拽的边缘自动翻页 effect 见 loadSites 定义之后（依赖 page/pagination/loadSites）
  // 分类下完整站点顺序底册（服务端同口径排序，含置顶标记），拖拽/按钮落库时以它为底册套用本页结果；
  // 带置顶标记是为了支持跨页移动时判断相邻项是否可交换（置顶/普通分区边界不可跨越）
  const fullOrderRef = useRef<Array<{ id: string; isPinned: boolean }>>([])

  // 分页状态
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])

  // 加载网站列表
  // 请求代际守卫：快速连点页码/筛选与搜索并发时，慢的旧响应不得覆盖新状态
  // （照搬 dashboard 页 loadGenerationRef 模式）
  const loadGenerationRef = useRef(0)

  // silent=true 时跳过 loading 态：用于拖拽排序保存后的保底刷新，
  // 本地顺序已正确，整表替换成 spinner 再重建会造成明显闪动
  const loadSites = async (
    currentPage = page,
    currentPageSize = pageSize,
    silent = false
  ) => {
    const generation = ++loadGenerationRef.current
    if (!silent) setLoading(true)
    try {
      const result = await getSitesWithPagination({
        page: currentPage,
        pageSize: currentPageSize,
        search: searchKeyword.trim() || undefined,
        categoryId: filterCategory !== "all" ? filterCategory : undefined,
        isPublished: filterStatus !== "all" ? (filterStatus === "true") : undefined,
        submitterIp: submissionEnabled && filterSubmitter !== "all" ? filterSubmitter : undefined,
        sortBy,
        sortDir,
      })
      // 过期响应：已有更新的请求在途或完成，丢弃本次结果（含错误提示）
      if (generation !== loadGenerationRef.current) return
      if (result.success && result.data) {
        // 删除末页最后一条/筛选缩小结果后页码越界：clamp 回最后一个有效页重新拉取，
        // 避免「空列表 + 分页控件隐藏」的死端（与分类页口径一致）
        if (
          result.data.length === 0 &&
          result.pagination &&
          result.pagination.totalPages >= 1 &&
          currentPage > result.pagination.totalPages
        ) {
          await loadSites(result.pagination.totalPages, currentPageSize, silent)
          return
        }
        setSites(result.data)
        setPagination(result.pagination || null)
        setPage(result.pagination?.page || 1)
      } else {
        toast.error(tc("loadFailed"), {
          description: resolveActionError(tAE, result.error, t("cannotLoad")),
        })
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return
      toast.error(tc("loadFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      // 仅最新一代请求有权关 loading（被丢弃的请求可能更早返回）
      if (generation === loadGenerationRef.current) setLoading(false)
    }
  }

  // 加载分类列表
  const loadCategories = async () => {
    try {
      const result = await getCategoriesForFilter()
      if (result.success && result.data) {
        setCategories(result.data)
      }
    } catch (error) {
      console.error("Failed to load categories:", error)
    }
  }

  // 持有最新的 loadSites/loadCategories，供仅需挂载或按指定依赖触发的 effect 调用，
  // 避免 exhaustive-deps 缺依赖告警，同时不引入额外重新请求
  const loadSitesRef = useRef(loadSites)
  const loadCategoriesRef = useRef(loadCategories)
  useEffect(() => {
    loadSitesRef.current = loadSites
    loadCategoriesRef.current = loadCategories
  })

  // 跨页拖拽：指针在视口上/下边缘感应区停留时自动翻页（静默加载不闪 spinner），
  // 可连续翻多页；拖回页面中部取消计时。置于 loadSites/pagination 声明之后（deps 渲染期求值）
  const EDGE_ZONE_PX = 72
  const EDGE_FLIP_DELAY_MS = 500
  useEffect(() => {
    if (!draggedSiteId || !dragOrderEnabled) return
    const cancelFlip = () => {
      if (edgeFlipTimerRef.current) {
        clearTimeout(edgeFlipTimerRef.current)
        edgeFlipTimerRef.current = null
      }
    }
    const onWindowDragOver = (e: DragEvent) => {
      if (flippingRef.current) return
      const dir =
        e.clientY < EDGE_ZONE_PX ? -1 : e.clientY > window.innerHeight - EDGE_ZONE_PX ? 1 : 0
      if (dir === 0) {
        cancelFlip()
        return
      }
      const targetPage = page + dir
      if (targetPage < 1 || (pagination && targetPage > pagination.totalPages)) {
        cancelFlip()
        return
      }
      // 已在倒计时中：维持原计划（dragover 持续触发，不能反复重置）
      if (edgeFlipTimerRef.current) return
      edgeFlipTimerRef.current = setTimeout(async () => {
        edgeFlipTimerRef.current = null
        flippingRef.current = true
        try {
          // 翻页后重置落点记忆，让新页第一行可立即作为落点
          lastOverIdRef.current = null
          setCrossPageTargetId(null)
          await loadSitesRef.current(targetPage, pageSize, true)
        } finally {
          flippingRef.current = false
        }
      }, EDGE_FLIP_DELAY_MS)
    }
    window.addEventListener("dragover", onWindowDragOver)
    return () => {
      window.removeEventListener("dragover", onWindowDragOver)
      cancelFlip()
    }
  }, [draggedSiteId, dragOrderEnabled, page, pageSize, pagination])

  useEffect(() => {
    loadSitesRef.current(1)
    loadCategoriesRef.current()
    // site-submission 插件启用状态决定来源筛选/来源列是否显示
    fetchPublicSettings().then((settings) => {
      setSubmissionEnabled(
        settings.plugins?.builtinEnabledIds?.includes("site-submission") ?? false
      )
    })
  }, [])

  // 顶栏切换工作区后重新加载当前工作区的网址与分类筛选列表
  useEffect(() => {
    const onWorkspaceChanged = () => {
      handleResetFilters()
      loadSitesRef.current(1)
      loadCategoriesRef.current()
    }
    window.addEventListener("workspace-context-changed", onWorkspaceChanged)
    return () =>
      window.removeEventListener("workspace-context-changed", onWorkspaceChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 重置筛选
  const handleResetFilters = () => {
    setFilterCategory("all")
    setFilterStatus("all")
    setFilterSubmitter("all")
    setSortBy("default")
    setSearchKeyword("")
    setPage(1)
  }

  // 切换排序方式时重置为该方式的合理默认方向：测活异常优先（asc）、最近添加优先（desc）
  const handleSortByChange = (value: string) => {
    const next = value as "default" | "health" | "createdAt"
    setSortBy(next)
    if (next === "createdAt") {
      setSortDir("desc")
    } else if (next === "health") {
      setSortDir("asc")
    }
  }

  // 筛选条件改变时重新加载
  // 跳过挂载时由初始依赖触发的那一次：挂载 effect 已做过首屏加载，
  // 否则每次进入页面会对同一列表发起两次完全相同的请求
  const isFirstFilterRun = useRef(true)
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false
      return
    }
    loadSitesRef.current(1)
  }, [filterCategory, filterStatus, filterSubmitter, sortBy, sortDir])

  // 搜索防抖，300ms 后重新加载
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false
      return
    }
    const timer = setTimeout(() => loadSitesRef.current(1), 300)
    return () => clearTimeout(timer)
  }, [searchKeyword])

  // 每页数量改变时重新加载
  const handlePageSizeChange = (value: string) => {
    const newSize = Number(value)
    setPageSize(newSize)
    loadSites(1, newSize)
  }

  // 拖拽排序：启用或切换分类时拉取该分类完整顺序底册
  useEffect(() => {
    if (!dragOrderEnabled || filterCategory === "all") {
      fullOrderRef.current = []
      return
    }
    let cancelled = false
    getCategorySiteOrder(filterCategory).then((result) => {
      if (!cancelled && result.success && result.data) {
        fullOrderRef.current = result.data as Array<{ id: string; isPinned: boolean }>
      }
    })
    return () => { cancelled = true }
  }, [dragOrderEnabled, filterCategory])

  const handleDragStartRow = (siteId: string) => {
    dragMovedRef.current = false
    lastOverIdRef.current = null
    dragStartOrderRef.current = sites
    setDraggedSiteId(siteId)
  }

  // 拖到其他行上时立即实时交换位置，拖动过程所见即所得
  const handleDragEnterRow = (siteId: string) => {
    if (!draggedSiteId || siteId === draggedSiteId || lastOverIdRef.current === siteId) return
    lastOverIdRef.current = siteId

    // 跨页拖拽：被拖行不在当前页（无法页内实时重排），仅标记落点显示插入指示线；
    // 翻回被拖行所在页后自动恢复页内实时重排
    if (!sites.some(s => s.id === draggedSiteId)) {
      setCrossPageTargetId(siteId)
      dragMovedRef.current = true
      return
    }
    setCrossPageTargetId(null)

    setSites(prev => {
      const from = prev.findIndex(s => s.id === draggedSiteId)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const to = next.findIndex(s => s.id === siteId)
      if (to < 0) return prev
      next.splice(to, 0, moved)
      dragMovedRef.current = true
      return next
    })
  }

  // dragEnd 总会触发；按被拖行是否在当前页分流：页内走实时重排映射落库，
  // 跨页直接在完整底册中移动到落点之前
  const handleDragEndRow = async () => {
    const dragged = draggedSiteId
    const moved = dragMovedRef.current
    const crossTarget = crossPageTargetId
    dragMovedRef.current = false
    lastOverIdRef.current = null
    setDraggedSiteId(null)
    setCrossPageTargetId(null)
    if (!dragged || !moved) return

    // ================= 跨页路径 =================
    if (!sites.some(s => s.id === dragged)) {
      const full = [...fullOrderRef.current]
      // 底册未就绪或无有效落点时放弃落库：用残缺列表写入会压扁其他页的顺序
      if (full.length === 0 || !crossTarget) return
      const fromIdx = full.findIndex(x => x.id === dragged)
      if (fromIdx < 0) return
      const [removed] = full.splice(fromIdx, 1)
      let toIdx = full.findIndex(x => x.id === crossTarget)
      if (toIdx < 0) toIdx = full.length
      full.splice(toIdx, 0, removed)
      // 稳定置顶分区（置顶区/普通区各自保序），与页内落库口径一致
      const ordered = [
        ...full.filter(x => x.isPinned),
        ...full.filter(x => !x.isPinned),
      ]

      setSavingOrder(true)
      try {
        const result = await updateSitesOrder(filterCategory, ordered.map(x => x.id))
        if (result.success) {
          fullOrderRef.current = ordered
          refreshFullOrder()
          toast.success(t("orderUpdated"))
          loadSites(page, pageSize, true)
        } else {
          toast.error(tc("operationFailed"), {
            description: resolveActionError(tAE, result.error, tc("retryLater")),
          })
        }
      } catch {
        toast.error(tc("operationFailed"), {
          description: tc("retryLater"),
        })
      } finally {
        setSavingOrder(false)
      }
      return
    }

    // ================= 页内路径 =================
    // 置顶站点始终显示在最前：落库前稳定分区（置顶区/普通区各自保序），
    // 避免「拖到置顶上方、刷新后却不生效」的错觉
    const newVisible = [
      ...sites.filter(s => s.isPinned),
      ...sites.filter(s => !s.isPinned),
    ].map(s => s.id)

    // 用可见页的新顺序替换完整底册中对应位置的条目（位置集合不变，仅换内容，置顶标记随站点走）；
    // 位置按拖拽发起时的原始快照计算，因为 sites 已被实时重排改写。
    // 底册与快照可能因并发操作（拖拽中删除/静默刷新）短暂不同步：
    // 缺失的条目过滤掉而非断言崩溃，剩余条目仍按相对顺序落库
    const siteById = new Map(dragStartOrderRef.current.map(s => [s.id, { id: s.id, isPinned: !!s.isPinned }]))
    const full = [...fullOrderRef.current]
    if (full.length > 0) {
      const positions = dragStartOrderRef.current
        .map(s => full.findIndex(x => x.id === s.id))
        .filter(p => p >= 0)
        .sort((a, b) => a - b)
      const ordered = newVisible
        .map(id => siteById.get(id))
        .filter((x): x is { id: string; isPinned: boolean } => Boolean(x))
      positions.forEach((pos, i) => {
        if (ordered[i]) full[pos] = ordered[i]
      })
    }
    const fallbackOrder = newVisible
      .map(id => siteById.get(id))
      .filter((x): x is { id: string; isPinned: boolean } => Boolean(x))

    setSavingOrder(true)
    try {
      const orderedIds = (full.length > 0 ? full : fallbackOrder).map(x => x.id)
      const result = await updateSitesOrder(filterCategory, orderedIds)
      if (result.success) {
        fullOrderRef.current = full.length > 0 ? full : fallbackOrder
        refreshFullOrder()
        toast.success(t("orderUpdated"))
        loadSites(page, pageSize, true)
      } else {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } catch {
      toast.error(tc("operationFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setSavingOrder(false)
    }
  }

  // 保存成功后刷新顺序底册：置顶切换等操作可能改变分区结构，保持 canMoveRow 判断准确
  const refreshFullOrder = () => {
    getCategorySiteOrder(filterCategory).then((result) => {
      if (result.success && result.data) {
        fullOrderRef.current = result.data as Array<{ id: string; isPinned: boolean }>
      }
    })
  }

  // 上移/下移是否可行：以完整底册为基准判断相邻项，跨页也能正确禁用
  // （底册按「置顶优先」排序，相邻项置顶标记不同即跨分区边界，不可交换）
  const canMoveRow = (siteId: string, dir: -1 | 1) => {
    if (savingOrder || loading) return false
    const full = fullOrderRef.current
    const idx = full.findIndex(x => x.id === siteId)
    if (idx < 0) return false
    const target = idx + dir
    if (target < 0 || target >= full.length) return false
    return full[target].isPinned === full[idx].isPinned
  }

  // 上移/下移：与完整底册中的相邻项直接交换，天然支持跨页移动
  // （如把本页第一条上移 = 与上一页最后一条互换，保存后刷新当前页即可看到效果）
  const handleMoveRow = async (siteId: string, dir: -1 | 1) => {
    if (!canMoveRow(siteId, dir)) return
    const full = [...fullOrderRef.current]
    const idx = full.findIndex(x => x.id === siteId)
    const target = idx + dir
    ;[full[idx], full[target]] = [full[target], full[idx]]

    setSavingOrder(true)
    try {
      const result = await updateSitesOrder(filterCategory, full.map(x => x.id))
      if (result.success) {
        fullOrderRef.current = full
        refreshFullOrder()
        toast.success(t("orderUpdated"))
        // 两行都在当前页时先本地交换；静默刷新兜底（覆盖跨页交换的场景）
        setSites(prev => {
          const from = prev.findIndex(s => s.id === siteId)
          const to = prev.findIndex(s => s.id === full[target].id)
          if (from < 0 || to < 0) return prev
          const next = [...prev]
          ;[next[from], next[to]] = [next[to], next[from]]
          return next
        })
        loadSites(page, pageSize, true)
      } else {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } catch {
      toast.error(tc("operationFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setSavingOrder(false)
    }
  }

  // 打开创建对话框
  const handleCreate = () => {
    setDialogMode("create")
    setEditingSite(null)
    setDialogOpen(true)
  }

  // 打开编辑对话框
  const handleEdit = (site: Site) => {
    setDialogMode("edit")
    setEditingSite(site)
    setDialogOpen(true)
  }

  // 页面切换处理
  const handlePageChange = (newPage: number) => {
    if (loading) return
    if (newPage < 1 || (pagination && newPage > pagination.totalPages)) return
    loadSites(newPage)
  }

  // 打开删除确认对话框
  const handleDeleteClick = (siteId: string) => {
    setDeletingSiteId(siteId)
    setDeleteDialogOpen(true)
  }

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deletingSiteId) return

    try {
      const result = await deleteSite(deletingSiteId)
      if (result.success) {
        toast.success(t("deleteSuccess"), {
          description: t("deleteSuccessDesc"),
        })
        // 本地移除 + 静默刷新，避免整表闪 spinner（末页清空的 clamp 由 loadSites 内置）
        setSites(prev => prev.filter(s => s.id !== deletingSiteId))
        loadSites(page, pageSize, true)
      } else {
        toast.error(t("deleteFailed"), {
          description: resolveActionError(tAE, result.error, t("deleteFailedDesc")),
        })
      }
    } catch (error) {
      toast.error(t("deleteFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setDeleteDialogOpen(false)
      setDeletingSiteId(null)
    }
  }

  // 切换发布状态（防连点）
  const [togglingPublishId, setTogglingPublishId] = useState<string | null>(null)

  const handleTogglePublish = async (siteId: string) => {
    if (togglingPublishId) return
    setTogglingPublishId(siteId)
    try {
      const result = await toggleSitePublish(siteId)
      if (result.success) {
        toast.success(t("statusUpdated"), {
          description: t("publishToggledDesc"),
        })
        setSites(prev => prev.map(s => (s.id === siteId ? { ...s, isPublished: !s.isPublished } : s)))
        loadSites(page, pageSize, true)
      } else {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, result.error, tc("operationFailed")),
        })
      }
    } catch (error) {
      toast.error(tc("operationFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setTogglingPublishId(null)
    }
  }

  // 切换置顶状态（防连点）
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null)
  const handleTogglePin = async (siteId: string, currentPin?: boolean) => {
    if (togglingPinId) return
    setTogglingPinId(siteId)
    try {
      const result = await toggleSitePin(siteId)
      if (result.success) {
        toast.success(currentPin ? t("unpinnedToast") : t("pinnedToast"), {
          description: currentPin ? t("unpinnedDesc") : t("pinnedDesc"),
        })
        setSites(prev => prev.map(s => (s.id === siteId ? { ...s, isPinned: !s.isPinned } : s)))
        // 置顶影响「置顶优先」排序（可能跨页移动），由静默刷新带回最终顺序；
        // 底册同步刷新，保证 canMoveRow 的置顶分区判断基于最新 isPinned
        refreshFullOrder()
        loadSites(page, pageSize, true)
      } else {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, result.error, t("pinToggleFailed")),
        })
      }
    } catch (error) {
      toast.error(tc("operationFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setTogglingPinId(null)
    }
  }

  // 单站测活（防连点）
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const handleCheckHealth = async (siteId: string) => {
    if (checkingId || batchChecking) return
    setCheckingId(siteId)
    try {
      const result = await checkSiteHealth(siteId)
      if (result.success && result.data) {
        const data = result.data as unknown as Site
        // 局部更新该行，避免整页重载丢失当前分页/筛选
        setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, ...data } : s)))
        if (data.healthStatus === "up") {
          toast.success(t("healthUp"), { description: t("checkUpDesc") })
        } else if (data.healthStatus === "suspicious") {
          toast.warning(t("healthSuspicious"), { description: t("checkSuspiciousDesc") })
        } else {
          toast.error(t("healthDown"), { description: t("checkDownDesc") })
        }
      } else {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } catch (error) {
      toast.error(tc("operationFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setCheckingId(null)
    }
  }

  // 全部测活：前端以受限并发逐个调用单站 Action（每个请求短，兼容 Serverless 超时）
  const HEALTH_CHECK_CONCURRENCY = 5
  const [batchChecking, setBatchChecking] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const batchCancelRef = useRef(false)

  const handleCheckAll = async () => {
    if (batchChecking || checkingId) return
    batchCancelRef.current = false
    setBatchChecking(true)
    setBatchProgress({ done: 0, total: 0 })
    try {
      const listResult = await getSiteIdsForHealthCheck()
      if (!listResult.success || !listResult.data) {
        toast.error(tc("operationFailed"), {
          description: resolveActionError(tAE, listResult.error, tc("retryLater")),
        })
        return
      }
      const targets = listResult.data as Array<{ id: string; name: string; url: string }>
      setBatchProgress({ done: 0, total: targets.length })

      let up = 0
      let down = 0
      let suspicious = 0
      let done = 0
      const queue = [...targets]

      const worker = async () => {
        while (queue.length > 0) {
          if (batchCancelRef.current) return
          const item = queue.shift()
          if (!item) return
          try {
            const result = await checkSiteHealth(item.id)
            const status = result.success && result.data
              ? (result.data as { healthStatus?: string }).healthStatus
              : undefined
            // 行级局部更新，与单站测活同口径；不在当前页的站点 map 自然空转
            if (status) {
              setSites(prev => prev.map(s => (s.id === item.id ? { ...s, healthStatus: status } : s)))
            }
            if (status === "up") {
              up += 1
            } else if (status === "suspicious") {
              suspicious += 1
            } else {
              down += 1
            }
          } catch {
            down += 1
          } finally {
            done += 1
            setBatchProgress({ done, total: targets.length })
          }
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(HEALTH_CHECK_CONCURRENCY, targets.length) },
          () => worker()
        )
      )

      if (batchCancelRef.current) {
        toast.warning(t("checkAllStopped"), {
          description: t("checkAllDoneDesc", { up, down, suspicious }),
        })
      } else {
        toast.success(t("checkAllDone"), {
          description: t("checkAllDoneDesc", { up, down, suspicious }),
        })
      }
      // 逐行已局部更新，这里静默刷新兜底对齐服务器数据
      loadSites(page, pageSize, true)
    } finally {
      setBatchChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 跨页拖拽进行中：视口上/下边缘显示翻页感应区指示条（停留自动翻页） */}
      {draggedSiteId && dragOrderEnabled && (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1.5 animate-fade-in bg-gradient-to-b from-primary/50 to-transparent" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-1.5 animate-fade-in bg-gradient-to-t from-primary/50 to-transparent" />
        </>
      )}
      {/* 筛选器工具栏 */}
      <div className="flex flex-wrap items-center gap-4">
          {/* 分类筛选 */}
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel>{t("filterCategory")}</FieldLabel>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-auto min-w-[140px]">
                <SelectValue placeholder={t("filterCategoryAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterCategoryAll")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* 状态筛选 */}
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel>{t("filterStatus")}</FieldLabel>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-auto min-w-[120px]">
                <SelectValue placeholder={t("filterStatusAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterStatusAll")}</SelectItem>
                <SelectItem value="true">{t("statusPublished")}</SelectItem>
                <SelectItem value="false">{t("statusUnpublished")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* 来源筛选 - site-submission 插件启用时显示 */}
          {submissionEnabled && (
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel>{t("filterSource")}</FieldLabel>
              <Select value={filterSubmitter} onValueChange={setFilterSubmitter}>
                <SelectTrigger className="w-auto min-w-[130px]">
                  <SelectValue placeholder={t("filterSourceAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterSourceAll")}</SelectItem>
                  <SelectItem value="true">{t("sourceUser")}</SelectItem>
                  <SelectItem value="false">{t("sourceAdminCreated")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* 排序 */}
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel>{t("sortBy")}</FieldLabel>
            <div className="flex items-center gap-1">
              <Select value={sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="w-auto min-w-[130px]">
                  <SelectValue placeholder={t("sortByDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("sortByDefault")}</SelectItem>
                  <SelectItem value="health">{t("sortByHealth")}</SelectItem>
                  <SelectItem value="createdAt">{t("sortByCreatedAt")}</SelectItem>
                </SelectContent>
              </Select>
              {sortBy !== "default" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                    >
                      {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      <span className="sr-only">{sortDir === "asc" ? t("sortDirDesc") : t("sortDirAsc")}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{sortDir === "asc" ? t("sortDirDesc") : t("sortDirAsc")}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </Field>

          {/* 重置按钮 */}
          {(filterCategory !== "all" || filterStatus !== "all" || (submissionEnabled && filterSubmitter !== "all") || sortBy !== "default") && (
                          <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleResetFilters}
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="sr-only">{t("resetFilters")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("resetFilters")}</p>
                </TooltipContent>
                          </Tooltip>
          )}

          {/* 搜索 */}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-[220px] pl-8"
            />
          </div>
        </div>

      {/* 网站列表卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>
            {t("totalSites", { count: pagination?.total || 0 })}
            {dragOrderEnabled && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <GripVertical className="h-3 w-3" />
                {t("dragOrderHint")}
              </span>
            )}
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              {batchChecking ? (
                <>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t("checkingProgress", { done: batchProgress.done, total: batchProgress.total })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => {
                      batchCancelRef.current = true
                    }}
                  >
                    <Square className="h-3.5 w-3.5" />
                    {t("stopCheckAll")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleCheckAll}
                  disabled={checkingId !== null}
                  className="gap-1.5"
                >
                  <Activity className="h-4 w-4" />
                  {t("checkAll")}
                </Button>
              )}
              <Button onClick={handleCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("addSite")}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sites.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Globe className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("emptyDesc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div ref={dragTableRef} className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {dragOrderEnabled && (
                      <TableHead className="w-12" />
                    )}
                    <TableHead className="w-20 min-w-[72px] text-center whitespace-nowrap">{t("thIcon")}</TableHead>
                    <TableHead className="min-w-[180px] whitespace-nowrap">{t("thNameDesc")}</TableHead>
                    <TableHead className="w-36 whitespace-nowrap">{t("thCategory")}</TableHead>
                    <TableHead className="w-24 text-center whitespace-nowrap">{t("thPinned")}</TableHead>
                    <TableHead className="w-24 text-center whitespace-nowrap">{t("thStatus")}</TableHead>
                    <TableHead className="w-24 text-center whitespace-nowrap">{t("thHealth")}</TableHead>
                    {submissionEnabled && (
                      <TableHead className="w-28 text-center whitespace-nowrap">{t("thSource")}</TableHead>
                    )}
                    <TableHead className="text-right w-44 whitespace-nowrap">{t("thActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((site) => (
                    <TableRow
                      key={site.id}
                      data-flip-id={site.id}
                      draggable={dragOrderEnabled && !savingOrder}
                      onDragStart={() => handleDragStartRow(site.id)}
                      onDragEnter={dragOrderEnabled ? () => handleDragEnterRow(site.id) : undefined}
                      onDragOver={(e) => dragOrderEnabled && e.preventDefault()}
                      onDragEnd={dragOrderEnabled ? handleDragEndRow : undefined}
                      className={[
                        site.isPinned ? "bg-amber-500/5" : "",
                        draggedSiteId === site.id ? "opacity-40" : "",
                        // 跨页拖拽的插入指示线：inset shadow 避免 table 边框合并模式的兼容问题
                        crossPageTargetId === site.id && draggedSiteId !== site.id
                          ? "shadow-[inset_0_2px_0_0_hsl(var(--primary))]"
                          : "",
                      ].join(" ").trim() || undefined}
                    >
                      {dragOrderEnabled && (
                        <TableCell className="w-12 pr-0">
                          <div className="flex flex-col items-center">
                            <button
                              type="button"
                              aria-label={t("moveUp")}
                              title={t("moveUp")}
                              disabled={!canMoveRow(site.id, -1)}
                              onClick={() => handleMoveRow(site.id, -1)}
                              className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <GripVertical
                              className={`h-4 w-4 ${savingOrder ? "text-muted-foreground/30" : "cursor-grab text-muted-foreground/60 hover:text-muted-foreground"}`}
                            />
                            <button
                              type="button"
                              aria-label={t("moveDown")}
                              title={t("moveDown")}
                              disabled={!canMoveRow(site.id, 1)}
                              onClick={() => handleMoveRow(site.id, 1)}
                              className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                      {/* 图标 */}
                      <TableCell className="text-center w-20 min-w-[72px]">
                        <div className="flex items-center justify-center">
                          {site.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={site.iconUrl}
                              alt={site.name}
                              className="h-8 w-8 rounded-md object-contain border bg-background p-0.5"
                              onError={(e) => {
                                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E"
                              }}
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center border">
                              <span className="text-xs font-semibold text-muted-foreground">
                                {site.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* 名称 & 描述 & URL */}
                      <TableCell>
                        <div className="space-y-1 max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{site.name}</span>
                            {site.isPinned && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                                <Pin className="h-2.5 w-2.5 fill-current" />
                                {t("pinnedBadge")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {site.description || t("noDescription")}
                          </p>
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                          >
                            <span className="truncate max-w-[200px]">{site.url}</span>
                            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                          </a>
                        </div>
                      </TableCell>

                      {/* 分类 */}
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {site.category?.name || t("uncategorized")}
                        </Badge>
                      </TableCell>

                      {/* 置顶切换开关 */}
                      <TableCell className="text-center">
                                                  <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={site.isPinned ? "default" : "ghost"}
                                size="sm"
                                disabled={togglingPinId !== null}
                                onClick={() => handleTogglePin(site.id, site.isPinned)}
                                className={`h-7 px-2 text-xs gap-1 transition-all ${
                                  site.isPinned
                                    ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                                    : "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                }`}
                              >
                                {togglingPinId === site.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Pin className={`h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110 ${site.isPinned ? "fill-current" : ""}`} />
                                )}
                                <span>{site.isPinned ? t("pinnedAction") : t("pinAction")}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{site.isPinned ? t("unpinHint") : t("pinHint")}</p>
                            </TooltipContent>
                                                  </Tooltip>
                      </TableCell>

                      {/* 状态 */}
                      <TableCell className="text-center">
                        {site.isPublished ? (
                          <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30">
                            {t("statusPublished")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">
                            {t("statusUnpublished")}
                          </Badge>
                        )}
                      </TableCell>

                      {/* 测活状态 */}
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default">
                              {site.healthStatus === "up" ? (
                                <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30">
                                  {t("healthUp")}
                                </Badge>
                              ) : site.healthStatus === "suspicious" ? (
                                <Badge variant="default" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/30">
                                  {t("healthSuspicious")}
                                </Badge>
                              ) : site.healthStatus === "down" ? (
                                <Badge variant="default" className="bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/30">
                                  {t("healthDown")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-muted-foreground">
                                  {t("healthUnknown")}
                                </Badge>
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {site.lastCheckedAt
                                ? t("healthDetail", {
                                    status: site.lastHttpStatus ?? "-",
                                    latency: site.latencyMs ?? "-",
                                    time: new Date(site.lastCheckedAt).toLocaleString(),
                                  })
                                : t("healthNeverChecked")}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      {/* 来源 - site-submission 插件启用时显示 */}
                      {submissionEnabled && (
                        <TableCell className="text-center text-muted-foreground">
                          {site.submitterIp ? (
                            <span className="text-xs font-mono text-muted-foreground">{t("sourceUser")}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/70">{t("sourceAdmin")}</span>
                          )}
                        </TableCell>
                      )}

                      {/* 操作 */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 单站测活 */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={checkingId !== null || batchChecking}
                                onClick={() => handleCheckHealth(site.id)}
                              >
                                {checkingId === site.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Activity className={`h-4 w-4 ${site.healthStatus === "up" ? "text-emerald-600" : site.healthStatus === "suspicious" ? "text-amber-500" : site.healthStatus === "down" ? "text-red-500" : "text-muted-foreground"}`} />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("checkHealth")}</p>
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={togglingPublishId !== null}
                                onClick={() => handleTogglePublish(site.id)}
                              >
                                  {togglingPublishId === site.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Power className={`h-4 w-4 ${site.isPublished ? "text-emerald-600" : "text-muted-foreground"}`} />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{site.isPublished ? t("unpublish") : t("publish")}</p>
                              </TooltipContent>
                                                      </Tooltip>

                                                      <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(site)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("editSite")}</p>
                              </TooltipContent>
                                                      </Tooltip>

                                                      <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteClick(site.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("deleteSite")}</p>
                              </TooltipContent>
                                                      </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分页组件 */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => handlePageChange(page - 1)}
                className={
                  page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                }
              />
            </PaginationItem>

            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(
                (pageNum) =>
                  pageNum === 1 ||
                  pageNum === pagination.totalPages ||
                  (pageNum >= page - 1 && pageNum <= page + 1)
              )
              .map((pageNum, idx, arr) => {
                const prevPage = arr[idx - 1]
                const showEllipsis = prevPage && pageNum - prevPage > 1

                return (
                  <div key={pageNum} className="flex items-center">
                    {showEllipsis && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => handlePageChange(pageNum)}
                        isActive={pageNum === page}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  </div>
                )
              })}

            <PaginationItem>
              <PaginationNext
                onClick={() => handlePageChange(page + 1)}
                className={
                  page === pagination.totalPages
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
              />
            </PaginationItem>

            <PaginationItem>
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[110px] text-xs" aria-label={t("pageSizeLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {t("perPage", { size })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <SiteFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        site={editingSite}
        mode={dialogMode}
        onSuccess={() => loadSites(page, pageSize, true)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
