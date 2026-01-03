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
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { CategoryFormDialog } from "@/components/admin/category-form-dialog"
import { getCategoriesWithPagination, deleteCategory } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"

interface Category {
  id: string
  name: string
  slug: string
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
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  // 分页状态
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)

  // 加载分类列表
  const loadCategories = async (currentPage = page) => {
    setLoading(true)
    try {
      const result = await getCategoriesWithPagination({ page: currentPage, pageSize: 10 })
      if (result.success && result.data) {
        setCategories(result.data)
        setPagination(result.pagination || null)
        setPage(result.pagination?.page || 1)
      } else {
        toast({
          variant: "destructive",
          title: "加载失败",
          description: result.error || "无法加载分类列表",
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
    loadCategories(1)
  }, [])

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
        toast({
          title: "删除成功",
          description: "分类已删除",
        })
        loadCategories()
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
      setDeletingCategoryId(null)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">分类管理</h1>
          <p className="text-muted-foreground">管理所有分类</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新增分类
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>分类列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无分类，点击「新增分类」添加第一个分类
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>标识</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>网站数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                    <TableCell>{category.order}</TableCell>
                    <TableCell>{category._count?.sites || 0}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(category.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(category.id)}
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

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categoryId={editingCategoryId}
        mode={dialogMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个分类吗？此操作将同时删除该分类下的所有网站，无法撤销。
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
