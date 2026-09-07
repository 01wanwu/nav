"use client"

import { useState, useEffect, useRef } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarkdownContent } from "@/components/markdown-content"
import { createSite, updateSite, getAdminCategories, type ScreenshotInput } from "@/lib/actions"
import { fetchPublicSettings } from "@/lib/client-settings"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Upload, Link2, Eye, Pencil } from "lucide-react"
import Image from "next/image"

interface Site {
  id: string
  name: string
  url: string
  description: string
  iconUrl: string | null
  categoryId: string
  isPublished: boolean
  isPinned?: boolean
}

interface Category {
  id: string
  name: string
}

// 截图表单项：新增项在客户端暂存（UPLOAD 为 base64），保存时统一提交；
// 编辑时从服务端回填的已有项携带 keepId，提交后原样保留而非删除重建
interface ScreenshotFormItem {
  key: string
  source: "URL" | "UPLOAD"
  keepId?: string
  url?: string
  data?: string
  mimeType?: string
  previewUrl: string
}

interface CapabilityInfo {
  supported: boolean
  reason?: string | null
  maxFileSize: number
  allowedMimeTypes: string[]
}

const MAX_SCREENSHOTS = 10

interface SiteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site?: Site | null
  mode: "create" | "edit"
  onSuccess?: () => void
}

export function SiteFormDialog({ open, onOpenChange, site, mode, onSuccess }: SiteFormDialogProps) {
  const router = useRouter()
  const t = useTranslations("admin.siteForm")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [enableSiteDetail, setEnableSiteDetail] = useState(false)
  const [mdView, setMdView] = useState<"edit" | "preview">("edit")
  const [capability, setCapability] = useState<CapabilityInfo | null>(null)
  const [screenshotUrlInput, setScreenshotUrlInput] = useState("")
  const [uploadingShot, setUploadingShot] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [screenshots, setScreenshots] = useState<ScreenshotFormItem[]>([])
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    description: "",
    iconUrl: "",
    categoryId: "",
    isPublished: false,
    isPinned: false,
    detailContent: "",
  })

  // 加载分类列表与功能开关状态（仅挂载时执行；默认分类通过函数式更新读取最新表单值）
  useEffect(() => {
    let cancelled = false
    async function loadCategories() {
      const result = await getAdminCategories()
      if (!cancelled && result.success && result.data) {
        const list = result.data
        setCategories(list)
        if (list.length > 0) {
          setFormData(prev =>
            prev.categoryId ? prev : { ...prev, categoryId: list[0].id }
          )
        }
      }
    }
    async function loadFeatureFlag() {
      // 详情编辑区显隐跟随 site-detail 内置插件的启用状态
      const settings = await fetchPublicSettings()
      if (!cancelled) {
        setEnableSiteDetail(
          settings.plugins?.builtinEnabledIds?.includes("site-detail") ?? false
        )
      }
    }
    loadCategories()
    loadFeatureFlag()
    return () => {
      cancelled = true
    }
  }, [])

  // 功能开启时检测上传能力（仅一次）
  useEffect(() => {
    if (!open || !enableSiteDetail || capability) return
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/admin/screenshot-capability")
        if (!cancelled && res.ok) {
          setCapability(await res.json())
        }
      } catch {
        // 检测失败按不支持处理
        if (!cancelled) {
          setCapability({ supported: false, reason: "unavailable", maxFileSize: 2 * 1024 * 1024, allowedMimeTypes: [] })
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [open, enableSiteDetail, capability])

  // 编辑模式：打开时拉取详情数据回填（Markdown 与截图）。
  // detailLoad 记录回填状态："loading" 未完成 / "ok" 成功 / "failed" 失败。
  // 提交时仅 "ok" 才携带截图与详情内容——回填失败/未完成时提交空列表
  // 会让 updateSite 的增量 diff 清空站点全部已有截图（不可逆数据丢失）
  const [detailLoad, setDetailLoad] = useState<"ok" | "loading" | "failed">("ok")
  const detailLoadTokenRef = useRef("")

  useEffect(() => {
    if (mode === "edit" && site && open) {
      const siteId = site.id
      detailLoadTokenRef.current = siteId
      setDetailLoad("loading")
      setFormData({
        name: site.name,
        url: site.url,
        description: site.description,
        iconUrl: site.iconUrl || "",
        categoryId: site.categoryId,
        isPublished: site.isPublished,
        isPinned: site.isPinned ?? false,
        detailContent: "",
      })
      setMdView("edit")
      setScreenshots([])
      // 按需拉取详情内容
      fetch(`/api/sites/${siteId}/detail`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          // 竞态防护：仅接受当前打开站点的响应（快速切换站点时旧响应作废）
          if (detailLoadTokenRef.current !== siteId) return
          if (!data) {
            setDetailLoad("failed")
            return
          }
          setFormData(prev => ({ ...prev, detailContent: data.detailContent || "" }))
          setScreenshots(
            (data.screenshots || []).map((shot: { id: string; source: string; displayUrl: string }) =>
              shot.source === "UPLOAD"
                ? {
                    key: shot.id,
                    source: "UPLOAD" as const,
                    keepId: shot.id,
                    previewUrl: shot.displayUrl,
                  }
                : {
                    key: shot.id,
                    source: "URL" as const,
                    keepId: shot.id,
                    url: shot.displayUrl,
                    previewUrl: shot.displayUrl,
                  }
            )
          )
          setDetailLoad("ok")
        })
        .catch(() => {
          // 拉取失败不阻塞基本信息编辑；但详情数据视为未知，提交时不得携带空 diff
          if (detailLoadTokenRef.current === siteId) setDetailLoad("failed")
        })
    } else if (mode === "create") {
      detailLoadTokenRef.current = ""
      setDetailLoad("ok")
      setFormData({
        name: "",
        url: "",
        description: "",
        iconUrl: "",
        categoryId: "",
        isPublished: false,
        isPinned: false,
        detailContent: "",
      })
      setScreenshots([])
    }
  }, [site, mode, open])

  // ================= 截图管理 =================

  const addUrlScreenshot = () => {
    const url = screenshotUrlInput.trim()
    if (!url) return
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toast.error(t("screenshotUrlInvalid"))
        return
      }
    } catch {
      toast.error(t("screenshotUrlInvalid"))
      return
    }
    if (screenshots.length >= MAX_SCREENSHOTS) {
      toast.error(t("screenshotLimit", { count: MAX_SCREENSHOTS }))
      return
    }
    setScreenshots(prev => [...prev, {
      key: `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: "URL",
      url,
      previewUrl: url,
    }])
    setScreenshotUrlInput("")
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!capability?.allowedMimeTypes.includes(file.type)) {
      toast.error(t("screenshotTypeInvalid"))
      return
    }
    if (file.size > (capability?.maxFileSize ?? 2 * 1024 * 1024)) {
      toast.error(t("screenshotTooLarge", { size: Math.floor((capability?.maxFileSize ?? 2097152) / 1024 / 1024) }))
      return
    }
    if (screenshots.length >= MAX_SCREENSHOTS) {
      toast.error(t("screenshotLimit", { count: MAX_SCREENSHOTS }))
      return
    }
    setUploadingShot(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("read failed"))
        reader.readAsDataURL(file)
      })
      // dataUrl 格式：data:<mime>;base64,<payload>
      const [meta, payload] = dataUrl.split(",")
      const mimeType = meta.slice(5, meta.indexOf(";"))
      setScreenshots(prev => [...prev, {
        key: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: "UPLOAD",
        data: payload,
        mimeType,
        previewUrl: dataUrl,
      }])
    } catch {
      toast.error(t("screenshotReadFailed"))
    } finally {
      setUploadingShot(false)
    }
  }

  const removeScreenshot = (key: string) => {
    setScreenshots(prev => prev.filter(shot => shot.key !== key))
  }

  const moveScreenshot = (index: number, direction: -1 | 1) => {
    setScreenshots(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // ================= 提交 =================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 截图数据转换：编辑回填的已有项带 keepId 原样保留；新增 UPLOAD 携带 base64；
      // 新增 URL 携带外链。已存在的 URL 截图 displayUrl 即原始外链，可正常通过校验
      const screenshotInputs: ScreenshotInput[] = screenshots.map(shot => {
        if (shot.keepId) {
          return { source: shot.source, keepId: shot.keepId }
        }
        if (shot.source === "UPLOAD") {
          return { source: "UPLOAD", data: shot.data, mimeType: shot.mimeType }
        }
        return { source: "URL", url: shot.url }
      })

      const payload = {
        name: formData.name,
        url: formData.url,
        description: formData.description,
        iconUrl: formData.iconUrl || undefined,
        categoryId: formData.categoryId,
        isPublished: formData.isPublished,
        isPinned: formData.isPinned,
        // 详情数据仅在回填成功后提交：回填中/失败时置 undefined，
        // updateSite 会保留服务端现值，避免空列表 diff 清空已有截图
        detailContent: enableSiteDetail && detailLoad === "ok" ? formData.detailContent : undefined,
        screenshots: enableSiteDetail && detailLoad === "ok" ? screenshotInputs : undefined,
      }

      const result = mode === "create"
        ? await createSite(payload)
        : await updateSite(site!.id, payload)

      if (result.success) {
        toast.success(mode === "create" ? t("createSuccess") : t("updateSuccess"), {
          description: mode === "create"
            ? t("createSuccessDesc", { name: formData.name })
            : t("updateSuccessDesc", { name: formData.name }),
        })
        onOpenChange(false)
        onSuccess?.()
        router.refresh()
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
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`flex max-h-[85vh] flex-col overflow-hidden ${
          enableSiteDetail ? "sm:max-w-[680px]" : "sm:max-w-[500px]"
        }`}
        // 提交中阻止 Esc/点遮罩关闭：防止误关丢表单、请求结果丢失上下文
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("createDesc") : t("editDesc")}
          </DialogDescription>
        </DialogHeader>

        {/* 头部与底栏固定，仅表单内容区内部滚动：截图再多弹窗高度也保持稳定 */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {enableSiteDetail ? (
            <Tabs defaultValue="basic" className="flex min-h-0 flex-1 flex-col py-4">
              <TabsList className="grid w-full shrink-0 grid-cols-2">
                <TabsTrigger value="basic">{t("tabBasic")}</TabsTrigger>
                <TabsTrigger value="detail">{t("tabDetail")}</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <BasicInfoFields
                  formData={formData}
                  setFormData={setFormData}
                  categories={categories}
                />
              </TabsContent>

              <TabsContent value="detail" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <DetailContentFields
                  formData={formData}
                  setFormData={setFormData}
                  mdView={mdView}
                  setMdView={setMdView}
                  screenshots={screenshots}
                  screenshotUrlInput={screenshotUrlInput}
                  setScreenshotUrlInput={setScreenshotUrlInput}
                  addUrlScreenshot={addUrlScreenshot}
                  removeScreenshot={removeScreenshot}
                  moveScreenshot={moveScreenshot}
                  capability={capability}
                  uploadingShot={uploadingShot}
                  fileInputRef={fileInputRef}
                  handleFileSelect={handleFileSelect}
                />
              </TabsContent>

              <DialogFooter className="mt-4 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "create" ? t("createBtn") : t("saveBtn")}
                </Button>
              </DialogFooter>
            </Tabs>
          ) : (
            <>
              <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-4 pr-1">
                <BasicInfoFields
                  formData={formData}
                  setFormData={setFormData}
                  categories={categories}
                />
              </div>

              <DialogFooter className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "create" ? t("createBtn") : t("saveBtn")}
                </Button>
              </DialogFooter>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ================= 基本信息（现有字段） =================

function BasicInfoFields({
  formData,
  setFormData,
  categories,
}: {
  formData: {
    name: string
    url: string
    description: string
    iconUrl: string
    categoryId: string
    isPublished: boolean
    isPinned: boolean
    detailContent: string
  }
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string
    url: string
    description: string
    iconUrl: string
    categoryId: string
    isPublished: boolean
    isPinned: boolean
    detailContent: string
  }>>
  categories: Category[]
}) {
  const t = useTranslations("admin.siteForm")
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">{t("nameLabel")}</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t("namePlaceholder")}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="url">{t("urlLabel")}</Label>
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
        <Label htmlFor="category">{t("categoryLabel")}</Label>
        <Select
          value={formData.categoryId}
          onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
          required
        >
          <SelectTrigger>
            <SelectValue placeholder={t("categoryPlaceholder")} />
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
        <Label htmlFor="description">{t("descLabel")}</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t("descPlaceholder")}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="iconUrl">{t("iconLabel")}</Label>
        <Input
          id="iconUrl"
          type="url"
          value={formData.iconUrl}
          onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
          placeholder="https://example.com/icon.png"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
        <div className="space-y-0.5">
          <Label htmlFor="pinned" className="font-medium">{t("pinnedLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("pinnedDesc")}
          </p>
        </div>
        <Switch
          id="pinned"
          checked={formData.isPinned}
          onCheckedChange={(checked) => setFormData({ ...formData, isPinned: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="published">{t("publishedLabel")}</Label>
          <p className="text-sm text-muted-foreground">
            {t("publishedDesc")}
          </p>
        </div>
        <Switch
          id="published"
          checked={formData.isPublished}
          onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
        />
      </div>
    </div>
  )
}

// ================= 详情内容（Markdown + 截图） =================

function DetailContentFields({
  formData,
  setFormData,
  mdView,
  setMdView,
  screenshots,
  screenshotUrlInput,
  setScreenshotUrlInput,
  addUrlScreenshot,
  removeScreenshot,
  moveScreenshot,
  capability,
  uploadingShot,
  fileInputRef,
  handleFileSelect,
}: {
  formData: { detailContent: string }
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string
    url: string
    description: string
    iconUrl: string
    categoryId: string
    isPublished: boolean
    isPinned: boolean
    detailContent: string
  }>>
  mdView: "edit" | "preview"
  setMdView: (v: "edit" | "preview") => void
  screenshots: ScreenshotFormItem[]
  screenshotUrlInput: string
  setScreenshotUrlInput: (v: string) => void
  addUrlScreenshot: () => void
  removeScreenshot: (key: string) => void
  moveScreenshot: (index: number, direction: -1 | 1) => void
  capability: CapabilityInfo | null
  uploadingShot: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const t = useTranslations("admin.siteForm")
  return (
    <div className="grid min-w-0 gap-5">
      {/* Markdown 编辑/预览 */}
      <div className="grid min-w-0 gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="detail-content">{t("detailContentLabel")}</Label>
          <div className="flex items-center rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setMdView("edit")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                mdView === "edit" ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              <Pencil className="h-3 w-3" />
              {t("mdEdit")}
            </button>
            <button
              type="button"
              onClick={() => setMdView("preview")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                mdView === "preview" ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              <Eye className="h-3 w-3" />
              {t("mdPreview")}
            </button>
          </div>
        </div>
        {mdView === "edit" ? (
          <Textarea
            id="detail-content"
            value={formData.detailContent}
            onChange={(e) => setFormData(prev => ({ ...prev, detailContent: e.target.value }))}
            placeholder={t("detailPlaceholder")}
            rows={8}
            className="font-mono text-xs"
          />
        ) : (
          <div className="min-h-[200px] min-w-0 max-w-full overflow-x-hidden rounded-md border bg-muted/10 p-4">
            {formData.detailContent.trim() ? (
              <MarkdownContent content={formData.detailContent} />
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("previewEmpty")}</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("detailHint")}
        </p>
      </div>

      {/* 截图管理 */}
      <div className="grid min-w-0 gap-2">
        <div className="flex items-center justify-between">
          <Label>{t("screenshotsLabel")}</Label>
          <span className="text-xs text-muted-foreground">
            {screenshots.length}/{MAX_SCREENSHOTS}
          </span>
        </div>

        {/* URL 添加 */}
        <div className="flex gap-2">
          <Input
            value={screenshotUrlInput}
            onChange={(e) => setScreenshotUrlInput(e.target.value)}
            placeholder={t("screenshotUrlPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addUrlScreenshot()
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addUrlScreenshot}>
            <Link2 className="mr-1 h-3.5 w-3.5" />
            {t("addByUrl")}
          </Button>
        </div>

        {/* 上传按钮（能力检测通过才可用） */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={!capability?.supported || uploadingShot}
          title={!capability?.supported ? t("uploadDisabled") : undefined}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingShot ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("uploadScreenshot")}
        </Button>
        {!capability?.supported && (
          <p className="text-xs text-muted-foreground/80">{t("uploadDisabled")}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* 截图列表 */}
        {screenshots.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {screenshots.map((shot, index) => (
              <div key={shot.key} className="group relative overflow-hidden rounded-lg border bg-muted/20 transition-all duration-200 hover:shadow-md hover:border-primary/40 hover:scale-[1.02]">
                <div className="relative aspect-video">
                  <Image
                    src={shot.previewUrl}
                    alt={`screenshot-${index}`}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1.5 py-1 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => moveScreenshot(index, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveScreenshot(index, 1)}
                      disabled={index === screenshots.length - 1}
                      className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeScreenshot(shot.key)}
                    className="rounded p-1 text-white/80 hover:bg-red-500/80 hover:text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/90">
                  {shot.source === "URL" ? "URL" : "UPLOAD"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
