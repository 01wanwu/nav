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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { createSite, updateSite, getAllCategories } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  categoryId: string
  isPublished: boolean
}

interface Category {
  id: string
  name: string
}

interface SiteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site?: Site | null
  mode: "create" | "edit"
}

export function SiteFormDialog({ open, onOpenChange, site, mode }: SiteFormDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    description: "",
    iconUrl: "",
    categoryId: "",
    isPublished: false,
  })

  // 加载分类列表
  useEffect(() => {
    async function loadCategories() {
      const result = await getAllCategories()
      if (result.success && result.data) {
        setCategories(result.data)
        if (result.data.length > 0 && !formData.categoryId) {
          setFormData(prev => ({ ...prev, categoryId: result.data[0].id }))
        }
      }
    }
    loadCategories()
  }, [])

  // 编辑模式：填充表单数据
  useEffect(() => {
    if (mode === "edit" && site) {
      setFormData({
        name: site.name,
        url: site.url,
        description: site.description,
        iconUrl: site.iconUrl || "",
        categoryId: site.categoryId,
        isPublished: site.isPublished,
      })
    } else if (mode === "create") {
      setFormData({
        name: "",
        url: "",
        description: "",
        iconUrl: "",
        categoryId: "",
        isPublished: false,
      })
    }
  }, [site, mode, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = mode === "create"
        ? await createSite(formData)
        : await updateSite(site!.id, formData)

      if (result.success) {
        toast({
          title: mode === "create" ? "创建成功" : "更新成功",
          description: `网站"${formData.name}"已${mode === "create" ? "创建" : "更新"}`,
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新增网站" : "编辑网站"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "添加一个新的网站到导航" : "修改网站信息"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">网站名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：Google"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">网站链接 *</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">分类 *</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">描述 *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="简短描述这个网站..."
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="iconUrl">图标 URL</Label>
              <Input
                id="iconUrl"
                type="url"
                value={formData.iconUrl}
                onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                placeholder="https://example.com/icon.png"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="published">发布状态</Label>
                <p className="text-sm text-muted-foreground">
                  是否在前台显示此网站
                </p>
              </div>
              <Switch
                id="published"
                checked={formData.isPublished}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
              />
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
