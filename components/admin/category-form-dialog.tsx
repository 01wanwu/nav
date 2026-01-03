"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCategory, updateCategory, getCategoryById } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface Category {
  id: string
  name: string
  slug: string
  order: number
}

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId?: string | null
  mode: "create" | "edit"
}

export function CategoryFormDialog({ open, onOpenChange, categoryId, mode }: CategoryFormDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    order: 0,
  })

  // 编辑模式：加载分类数据
  useEffect(() => {
    async function loadCategory() {
      if (mode === "edit" && categoryId) {
        const result = await getCategoryById(categoryId)
        if (result.success && result.data) {
          setFormData({
            name: result.data.name,
            slug: result.data.slug,
            order: result.data.order,
          })
        }
      } else if (mode === "create") {
        setFormData({ name: "", slug: "", order: 0 })
      }
    }
    loadCategory()
  }, [categoryId, mode, open])

  // 根据名称自动生成 slug
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
  }

  const handleNameChange = (value: string) => {
    setFormData({
      ...formData,
      name: value,
      slug: mode === "create" ? generateSlug(value) : formData.slug,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = mode === "create"
        ? await createCategory(formData)
        : await updateCategory(categoryId!, formData)

      if (result.success) {
        toast({
          title: mode === "create" ? "创建成功" : "更新成功",
          description: `分类"${formData.name}"已${mode === "create" ? "创建" : "更新"}`,
        })
        onOpenChange(false)
        router.refresh()
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新增分类" : "编辑分类"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "添加一个新的分类" : "修改分类信息"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">分类名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如：技术"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">标识 (Slug) *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="tech"
                required
              />
              <p className="text-xs text-muted-foreground">
                URL 中的标识符，只能包含小写字母、数字和连字符
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="order">排序</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                数字越小排序越靠前
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "创建" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
