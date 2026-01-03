"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Plus, Pencil, Trash2, Power, Loader2 } from "lucide-react"
import { SiteFormDialog } from "@/components/admin/site-form-dialog"
import { getSitesWithPagination, deleteSite, toggleSitePublish } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  categoryId: string
  isPublished: boolean
  order: number
  category: {
    id: string
    name: string
  }
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function AdminSitesPage() {
  const { toast } = useToast()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null)

  // 分页状态
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)

  // 加载网站列表
  const loadSites = async (currentPage = page) => {
    setLoading(true)
    try {
      const result = await getSitesWithPagination({ page: currentPage, pageSize: 10 })
      if (result.success && result.data) {
        setSites(result.data)
        setPagination(result.pagination || null)
        setPage(result.pagination?.page || 1)
      } else {
        toast({
          variant: "destructive",
          title: "加载失败",
          description: result.error || "无法加载网站列表",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "加载失败",
        description: "发生错误，请稍后重试",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSites(1)
  }, [])

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
        toast({
          title: "删除成功",
          description: "网站已删除",
        })
        loadSites()
      } else {
        toast({
          variant: "destructive",
          title: "删除失败",
          description: result.error || "删除失败，请稍后重试",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: "发生错误，请稍后重试",
      })
    } finally {
      setDeleteDialogOpen(false)
      setDeletingSiteId(null)
    }
  }

  // 切换发布状态
  const handleTogglePublish = async (siteId: string) => {
    try {
      const result = await toggleSitePublish(siteId)
      if (result.success) {
        toast({
          title: "状态已更新",
          description: "网站发布状态已切换",
        })
        loadSites()
      } else {
        toast({
          variant: "destructive",
          title: "操作失败",
          description: result.error || "操作失败，请稍后重试",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "操作失败",
        description: "发生错误，请稍后重试",
      })
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">网站管理</h1>
          <p className="text-muted-foreground">管理所有网站链接</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新增网站
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>网站列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无网站，点击「新增网站」添加第一个网站
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">图标</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      {site.iconUrl ? (
                        <img
                          src={site.iconUrl}
                          alt={site.name}
                          className="h-8 w-8 rounded object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E"
                          }}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">
                            {site.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {site.url}
                      </a>
                    </TableCell>
                    <TableCell>{site.category.name}</TableCell>
                    <TableCell>
                      {site.isPublished ? (
                        <Badge variant="default">已发布</Badge>
                      ) : (
                        <Badge variant="secondary">草稿</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTogglePublish(site.id)}
                        title={site.isPublished ? "取消发布" : "发布"}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(site)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(site.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

            {/* 页码 */}
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

      <SiteFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        site={editingSite}
        mode={dialogMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个网站吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
