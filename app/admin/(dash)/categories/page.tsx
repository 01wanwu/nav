"use client"

import { useState, useEffect, useRef } from "react"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Info,
  CheckCircle2,
  FolderKanban,
} from "lucide-react"
import { CategoryFormDialog } from "@/components/admin/category-form-dialog"
import { CategoryIconBadge } from "@/components/category-icon"
import { getCategoriesWithPagination, deleteCategory, updateCategoriesOrder } from "@/lib/actions"
import { toast } from "sonner"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"
import { useFlipList } from "@/hooks/use-flip-list"

interface Category {
  id: string
  name: string
  slug: string
  icon?: string | null
  order: number
  _count?: {
    sites: number
  }
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function AdminCategoriesPage() {
  const t = useTranslations("admin.categories")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  // 拖拽排序：id 追踪 + 实时重排预览（dragover 时立即交换位置），dragEnd 才落库
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragMovedRef = useRef(false)
  const lastOverIdRef = useRef<string | null>(null)
  const dragTableRef = useFlipList(useRef<HTMLDivElement>(null), draggedId !== null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  // 分页状态
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)

  // 加载分类列表
  // silent=true 时跳过 loading 态：用于删除/保存成功后的保底刷新，
  // 本地状态已更新，整表替换成 spinner 再重建会造成明显闪动
  const loadGenerationRef = useRef(0)
  const loadCategories = async (currentPage = page, silent = false) => {
    const generation = ++loadGenerationRef.current
    if (!silent) setLoading(true)
    try {
      const result = await getCategoriesWithPagination({ page: currentPage, pageSize: 20 })
      // 过期响应：已有更新的请求在途或完成，丢弃本次结果（含错误提示）
      if (generation !== loadGenerationRef.current) return
      if (result.success && result.data) {
        // 删除末页最后一条后页码越界：clamp 回最后一个有效页重新拉取，
        // 避免「空列表 + 分页控件隐藏」的死端
        if (
          result.data.length === 0 &&
          result.pagination &&
          result.pagination.totalPages >= 1 &&
          currentPage > result.pagination.totalPages
        ) {
          await loadCategories(result.pagination.totalPages, silent)
          return
        }
        // Sort by order ascending
        const sorted = [...result.data].sort((a, b) => a.order - b.order)
        setCategories(sorted)
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

  // 持有最新的 loadCategories，挂载 effect 仅执行一次且不缺依赖
  const loadCategoriesRef = useRef(loadCategories)
  useEffect(() => {
    loadCategoriesRef.current = loadCategories
  })

  useEffect(() => {
    loadCategoriesRef.current(1)
  }, [])

  // 顶栏切换工作区后重新加载当前工作区的分类列表
  useEffect(() => {
    const onWorkspaceChanged = () => loadCategoriesRef.current(1)
    window.addEventListener("workspace-context-changed", onWorkspaceChanged)
    return () =>
      window.removeEventListener("workspace-context-changed", onWorkspaceChanged)
  }, [])

  // 保存排序到数据库
  const persistOrder = async (updatedList: Category[]) => {
    setIsSavingOrder(true)
    try {
      const orderPayload = updatedList.map((cat, idx) => ({
        id: cat.id,
        order: idx + 1,
      }))
      const result = await updateCategoriesOrder(orderPayload)
      if (result.success) {
        toast.success(t("orderSaved"), {
          description: t("orderSavedDesc"),
        })
      } else {
        toast.error(t("orderSaveFailed"), {
          description: resolveActionError(tAE, result.error, t("cannotSaveOrder")),
        })
        loadCategories(page)
      }
    } catch (error) {
      toast.error(t("orderSaveFailed"), {
        description: t("networkError"),
      })
      loadCategories(page)
    } finally {
      setIsSavingOrder(false)
    }
  }

  // 拖拽排序逻辑
  const handleDragStart = (id: string) => {
    dragMovedRef.current = false
    lastOverIdRef.current = null
    setDraggedId(id)
  }

  // 拖到其他行上时立即实时交换位置，拖动过程所见即所得
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === id || lastOverIdRef.current === id) return
    lastOverIdRef.current = id

    setCategories(prev => {
      const from = prev.findIndex(c => c.id === draggedId)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const to = next.findIndex(c => c.id === id)
      if (to < 0) return prev
      next.splice(to, 0, moved)
      dragMovedRef.current = true
      return next.map((item, idx) => ({ ...item, order: idx + 1 }))
    })
  }

  // dragEnd 总会触发（包括拖出列表松手）；有实际移动才持久化
  const handleDragEnd = () => {
    const moved = dragMovedRef.current
    dragMovedRef.current = false
    lastOverIdRef.current = null
    setDraggedId(null)
    // 列表已在 dragover 中实时重排完成，闭包中的 categories 即最终顺序
    if (moved) persistOrder(categories)
  }

  // 上移/下移
  const handleMove = (id: string, direction: "up" | "down") => {
    const from = categories.findIndex(c => c.id === id)
    if (from < 0) return
    const targetIndex = direction === "up" ? from - 1 : from + 1
    if (targetIndex < 0 || targetIndex >= categories.length) return

    const updated = [...categories]
    const temp = updated[from]
    updated[from] = updated[targetIndex]
    updated[targetIndex] = temp

    const withNewOrders = updated.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }))
    setCategories(withNewOrders)
    persistOrder(withNewOrders)
  }

  // 打开创建对话框
  const handleCreate = () => {
    setDialogMode("create")
    setEditingCategoryId(null)
    setDialogOpen(true)
  }

  // 打开编辑对话框
  const handleEdit = (categoryId: string) => {
    setDialogMode("edit")
    setEditingCategoryId(categoryId)
    setDialogOpen(true)
  }

  // 页面切换处理
  const handlePageChange = (newPage: number) => {
    if (loading) return
    if (newPage < 1 || (pagination && newPage > pagination.totalPages)) return
    loadCategories(newPage)
  }

  // 打开删除确认对话框
  const handleDeleteClick = (categoryId: string) => {
    setDeletingCategoryId(categoryId)
    setDeleteDialogOpen(true)
  }

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deletingCategoryId) return

    try {
      const result = await deleteCategory(deletingCategoryId)
      if (result.success) {
        toast.success(t("deleteSuccess"), {
          description: t("deleteSuccessDesc"),
        })
        // 本地移除 + 静默刷新，避免整表闪 spinner（末页清空的 clamp 由 loadCategories 内置）
        setCategories(prev => prev.filter(c => c.id !== deletingCategoryId))
        loadCategories(page, true)
      } else {
        toast.error(t("deleteFailed"), {
          description: resolveActionError(
            tAE,
            result.error,
            t("deleteFailedDesc"),
            (result as { data?: { count?: number } }).data
          ),
        })
      }
    } catch (error) {
      toast.error(t("deleteFailed"), {
        description: tc("retryLater"),
      })
    } finally {
      setDeleteDialogOpen(false)
      setDeletingCategoryId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* 提示信息栏 */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3.5 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>{t("dragHintPre")}</strong> {t("dragHint")}
          </span>
        </div>
        {isSavingOrder && (
          <div className="flex items-center gap-1.5 text-primary font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{t("savingOrder")}</span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>
            {t("listDesc", { count: pagination?.total || 0 })}
          </CardDescription>
          <CardAction>
            <Button onClick={handleCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("addCategory")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanban className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("emptyDesc")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={handleCreate}>
                  <Plus className="h-4 w-4" /> {t("addCategory")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div ref={dragTableRef} className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px] text-center">{t("thOrder")}</TableHead>
                    <TableHead className="w-[180px]">{t("thIconName")}</TableHead>
                    <TableHead>{t("thSlug")}</TableHead>
                    <TableHead className="w-[100px] text-center">{t("thSites")}</TableHead>
                    <TableHead className="w-[120px] text-center">{t("thAdjust")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("thActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => {
                    const isDragging = draggedId === category.id

                    return (
                      <TableRow
                        key={category.id}
                        data-flip-id={category.id}
                        draggable={!isSavingOrder}
                        onDragStart={() => handleDragStart(category.id)}
                        onDragOver={(e) => handleDragOver(e, category.id)}
                        onDragEnd={handleDragEnd}
                        className={isDragging ? "opacity-40 bg-muted/70 cursor-grabbing" : ""}
                      >
                        {/* 拖拽手柄 & 序号 */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                              title={t("dragHandleTitle")}
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {category.order}
                            </span>
                          </div>
                        </TableCell>

                        {/* 图标与名称 */}
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {category.icon && (
                              <CategoryIconBadge icon={category.icon} size="md" className="h-8 w-8" />
                            )}
                            <div>
                              <div className="font-medium text-sm flex items-center gap-1.5">
                                {category.name}
                              </div>
                              {category.icon ? (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[120px] block">
                                  {t("iconPrefix")}{category.icon.startsWith("data:") ? t("customImage") : category.icon}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/60">
                                  {t("noIconSet")}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Slug */}
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs font-normal">
                            {category.slug}
                          </Badge>
                        </TableCell>

                        {/* 网站数 */}
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {category._count?.sites || 0}
                          </Badge>
                        </TableCell>

                        {/* 快捷上移/下移按钮 */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                                                          <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleMove(category.id, "up")}
                                    disabled={category.order === 1 || isSavingOrder}
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("moveUp")}</p>
                                </TooltipContent>
                                                          </Tooltip>

                                                          <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleMove(category.id, "down")}
                                    disabled={category.order === categories.length || isSavingOrder}
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("moveDown")}</p>
                                </TooltipContent>
                                                          </Tooltip>
                          </div>
                        </TableCell>

                        {/* 操作按钮 */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                                                          <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEdit(category.id)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("editCategory")}</p>
                                </TooltipContent>
                                                          </Tooltip>

                                                          <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteClick(category.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t("deleteCategory")}</p>
                                </TooltipContent>
                                                          </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
          </PaginationContent>
        </Pagination>
      )}

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categoryId={editingCategoryId}
        mode={dialogMode}
        onSuccess={() => loadCategories(page, true)}
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
