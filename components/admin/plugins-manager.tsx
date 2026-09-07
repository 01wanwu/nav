"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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
import { Loader2, Puzzle, Upload, Trash2, DownloadCloud } from "lucide-react"
import { toast } from "sonner"
import { invalidateSettingsCache } from "@/lib/client-settings"
import {
  setPluginEnabled,
  updatePluginConfig,
  uploadPluginManifest,
  deleteUploadedPlugin,
} from "@/lib/plugins/plugin-actions"
import { generateExtensionToken } from "@/plugins/browser-extension/actions"
import type {
  PluginConfigField,
} from "@/lib/plugins/types"

interface PluginView {
  id: string
  name: string
  description: string
  version: string
  author?: string
  source: "builtin" | "uploaded"
  enabled: boolean
  configFields: PluginConfigField[]
  manifestIcon?: string
  configValues: Record<string, number | string | boolean>
}

export function PluginsManager({ plugins }: { plugins: PluginView[] }) {
  const t = useTranslations("plugins.registry")
  const tAE = useTranslations("actionErrors")
  const [items, setItems] = useState(plugins)
  const [pending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<PluginView | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // router.refresh() 带回服务端最新插件列表后同步本地 items
  // （useState 初值只在挂载时取 props，RSC 刷新不会自动写入 state）
  useEffect(() => {
    setItems(plugins)
  }, [plugins])

  function handleToggle(plugin: PluginView, enabled: boolean) {
    startTransition(async () => {
      const result = await setPluginEnabled(plugin.id, enabled)
      if (result.success) {
        // 立即失效设置缓存：前台注入点/来源列/详情编辑区等消费方需读到最新插件状态
        invalidateSettingsCache()
        setItems((prev) =>
          prev.map((p) => (p.id === plugin.id ? { ...p, enabled } : p))
        )
        toast.success(t(enabled ? "enableSuccess" : "disableSuccess"))
      } else {
        toast.error(resolveActionError(tAE, result.error, t("updateFailed")))
      }
    })
  }

  function handleSaveConfig(
    plugin: PluginView,
    values: Record<string, number | string | boolean>
  ) {
    startTransition(async () => {
      const result = await updatePluginConfig(plugin.id, values)
      if (result.success) {
        setItems((prev) =>
          prev.map((p) =>
            p.id === plugin.id ? { ...p, configValues: { ...values } } : p
          )
        )
        toast.success(t("configSaved"))
      } else {
        toast.error(resolveActionError(tAE, result.error, t("updateFailed")))
      }
    })
  }

  function handleDelete(plugin: PluginView) {
    startTransition(async () => {
      const result = await deleteUploadedPlugin(plugin.id)
      if (result.success) {
        invalidateSettingsCache()
        setItems((prev) => prev.filter((p) => p.id !== plugin.id))
        toast.success(t("deleteSuccess"))
      } else {
        toast.error(resolveActionError(tAE, result.error, t("updateFailed")))
      }
      setDeleting(null)
    })
  }

  async function handleUploadFile(file: File) {
    setUploading(true)
    try {
      const raw = await file.text()
      const result = await uploadPluginManifest(raw)
      if (result.success && result.data?.id) {
        invalidateSettingsCache()
        toast.success(t("uploadSuccess"))
        // action 已 revalidatePath，refresh 拉回合并视图（含新插件）并经上方 effect 同步 items，
        // 不再整页 window.location.reload()
        router.refresh()
      } else {
        toast.error(resolveActionError(tAE, result.error, t("uploadFailed")), { duration: 8000 })
      }
    } catch {
      toast.error(t("uploadFailed"))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      {/* 上传插件 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            {t("uploadTitle")}
          </CardTitle>
          <CardDescription>{t("uploadDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUploadFile(file)
            }}
          />
          <Button
            variant="outline"
            disabled={uploading || pending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DownloadCloud className="mr-2 h-4 w-4" />
            )}
            {t("uploadButton")}
          </Button>
        </CardContent>
      </Card>

      {/* 已安装插件 */}
      <div className="grid gap-4">
        {items.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            disabled={pending}
            onToggle={handleToggle}
            onSaveConfig={handleSaveConfig}
            onDelete={setDeleting}
          />
        ))}
        {items.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Puzzle className="mr-2 h-4 w-4" />
              {t("empty")}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && handleDelete(deleting)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PluginCard({
  plugin,
  disabled,
  onToggle,
  onSaveConfig,
  onDelete,
}: {
  plugin: PluginView
  disabled: boolean
  onToggle: (plugin: PluginView, enabled: boolean) => void
  onSaveConfig: (
    plugin: PluginView,
    values: Record<string, number | string | boolean>
  ) => void
  onDelete: (plugin: PluginView) => void
}) {
  const t = useTranslations("plugins.registry")
  const tp = useTranslations()
  const tAE = useTranslations("actionErrors")
  const [values, setValues] = useState(plugin.configValues)
  const dirty = JSON.stringify(values) !== JSON.stringify(plugin.configValues)

  // 内置插件文案走 i18n（动态 key，收紧 t 签名绕过严格 key 类型）；
  // 上传插件直接使用 manifest 声明文案
  const tr = tp as unknown as (key: string) => string
  const displayName =
    plugin.source === "builtin" ? tr(plugin.name) : plugin.name
  const displayDescription =
    plugin.source === "builtin" ? tr(plugin.description) : plugin.description

  function setFieldValue(key: string, value: number | string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // browser-extension 插件专属：生成/复制访问令牌。
  // 令牌由服务端生成写入插件配置，这里仅展示与复制
  const [tokenGenerating, setTokenGenerating] = useState(false)

  async function handleGenerateToken() {
    setTokenGenerating(true)
    try {
      const result = await generateExtensionToken()
      if (result.success && result.token) {
        setValues((prev) => ({ ...prev, extensionToken: result.token! }))
        toast.success(tr("plugins.browserExtension.generated"))
      } else {
        toast.error(resolveActionError(tAE, result.error, t("updateFailed")))
      }
    } finally {
      setTokenGenerating(false)
    }
  }

  function handleCopyToken() {
    const token = String(values.extensionToken || "")
    if (!token) return
    navigator.clipboard.writeText(token)
    toast.success(tr("plugins.browserExtension.copied"))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 transition-transform duration-300 group-hover:scale-105">
              {plugin.manifestIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={plugin.manifestIcon}
                  alt=""
                  className="h-5 w-5"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Puzzle className="h-5 w-5" />
              )}
            </div>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {displayName}
                <Badge variant="outline" className="text-xs font-normal">
                  v{plugin.version || "-"}
                </Badge>
                <Badge variant="secondary" className="text-xs font-normal">
                  {plugin.source === "builtin" ? t("sourceBuiltin") : t("sourceUploaded")}
                </Badge>
              </CardTitle>
              {displayDescription && (
                <CardDescription className="mt-1 max-w-2xl">
                  {displayDescription}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plugin.source === "uploaded" && (
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => onDelete(plugin)}
                aria-label={t("delete")}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
            <Switch
              checked={plugin.enabled}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(plugin, checked)}
              aria-label={displayName}
            />
          </div>
        </div>
      </CardHeader>

      {plugin.enabled && plugin.configFields.length > 0 && (
        <CardContent>
          <Separator className="mb-4" />
          <div className="space-y-4">
            {plugin.configFields.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`${plugin.id}-${field.key}`} className="text-sm">
                  {plugin.source === "builtin"
                    ? tr(field.labelKey)
                    : field.labelKey}
                </Label>
                {plugin.id === "browser-extension" &&
                field.key === "extensionToken" ? (
                  <div className="flex flex-1 items-center justify-end gap-2">
                    <code className="min-w-0 max-w-[280px] flex-1 truncate rounded bg-muted px-2 py-1 text-right font-mono text-xs text-muted-foreground">
                      {String(values[field.key] || "") || "—"}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={tokenGenerating}
                      onClick={handleGenerateToken}
                    >
                      {tokenGenerating && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {tr("plugins.browserExtension.generate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!values[field.key]}
                      onClick={handleCopyToken}
                    >
                      {tr("plugins.browserExtension.copy")}
                    </Button>
                  </div>
                ) : field.type === "boolean" ? (
                  <Switch
                    id={`${plugin.id}-${field.key}`}
                    checked={Boolean(values[field.key])}
                    onCheckedChange={(checked) => setFieldValue(field.key, checked)}
                  />
                ) : (
                  <Input
                    id={`${plugin.id}-${field.key}`}
                    type={field.type === "number" ? "number" : "text"}
                    className="w-32"
                    min={field.min}
                    max={field.max}
                    value={String(values[field.key] ?? "")}
                    onChange={(e) =>
                      setFieldValue(
                        field.key,
                        field.type === "number"
                          ? Number(e.target.value)
                          : e.target.value
                      )
                    }
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end">
              <Button size="sm" disabled={disabled || !dirty} onClick={() => onSaveConfig(plugin, values)}>
                {t("saveConfig")}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
