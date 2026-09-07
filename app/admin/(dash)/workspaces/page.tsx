"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Globe,
  Star,
  Link2,
  X,
  Info,
  RefreshCw,
} from "lucide-react"
import { WorkspaceFormDialog } from "@/components/admin/workspace-form-dialog"
import {
  getWorkspaces,
  deleteWorkspace,
  setPrimaryWorkspace,
  addWorkspaceDomain,
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
} from "@/lib/actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"

interface DomainItem {
  id: string
  host: string
  isPrimary: boolean
  workspaceId: string
  lastVerifiedStatus?: string | null
  lastVerifiedAt?: string | Date | null
}

interface Workspace {
  id: string
  slug: string
  name: string
  description: string | null
  siteName: string | null
  siteDescription: string | null
  siteLogo: string | null
  favicon: string | null
  isDefault: boolean
  isPublished: boolean
  order: number
  domains: DomainItem[]
}

export default function AdminWorkspacesPage() {
  const t = useTranslations("admin.workspaces")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editing, setEditing] = useState<Workspace | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Workspace | null>(null)
  // 防重入门卫：设为默认 / 删除工作区 / 解绑域名各自独立 busy
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [removeDomainBusy, setRemoveDomainBusy] = useState(false)
  // 域名解绑确认框
  const [removingDomain, setRemovingDomain] = useState<DomainItem | null>(null)

  // 域名管理：记录正在操作的工作区与输入中的 host
  const [domainInput, setDomainInput] = useState<Record<string, string>>({})
  const [domainBusy, setDomainBusy] = useState<Record<string, boolean>>({})
  // 域名反向探测进行中标记（按域名 id）
  const [verifyBusy, setVerifyBusy] = useState<Record<string, boolean>>({})
  const loadRef = useRef(loadWorkspaces)

  async function loadWorkspaces() {
    setLoading(true)
    try {
      const result = await getWorkspaces()
      if (result.success && result.data) {
        setWorkspaces(result.data as Workspace[])
      } else {
        toast.error(tc("loadFailed"), { description: resolveActionError(tAE, result.error, t("cannotLoad"))})
      }
    } catch {
      toast.error(tc("loadFailed"), { description: tc("retryLater") })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRef.current = loadWorkspaces
  })
  useEffect(() => {
    loadRef.current()
  }, [])

  async function handleSetPrimary(ws: Workspace) {
    if (primaryBusy) return
    setPrimaryBusy(ws.id)
    try {
      const result = await setPrimaryWorkspace(ws.id)
      if (result.success) {
        toast.success(t("primarySet", { name: ws.name }))
        loadRef.current()
      } else {
        toast.error(resolveActionError(tAE, result.error, t("actionFailed")))
      }
    } catch {
      toast.error(tc("operationFailed"), { description: tc("retryLater") })
    } finally {
      setPrimaryBusy(null)
    }
  }

  async function handleDelete() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    try {
      const result = await deleteWorkspace(deleting.id)
      if (result.success) {
        toast.success(t("deleteSuccess"))
        loadRef.current()
      } else {
        toast.error(resolveActionError(tAE, result.error, t("actionFailed")))
      }
    } catch {
      // 异常也必须关确认框：否则框卡死且二次点击会重复调用
      toast.error(tc("operationFailed"), { description: tc("retryLater") })
    } finally {
      setDeleteBusy(false)
      setDeleteOpen(false)
      setDeleting(null)
    }
  }

  async function handleAddDomain(ws: Workspace) {
    const raw = (domainInput[ws.id] || "").trim()
    if (!raw) return
    // 入口检查 busy：Input 的 Enter 提交绕过按钮的 disabled，必须自行防重入
    if (domainBusy[ws.id]) return
    setDomainBusy(prev => ({ ...prev, [ws.id]: true }))
    try {
      const result = await addWorkspaceDomain(ws.id, raw)
      if (result.success) {
        setDomainInput(prev => ({ ...prev, [ws.id]: "" }))
        toast.success(t("domainAdded", { host: raw }))
        loadRef.current()
        // 绑定成功后立即探测一次，当场回答「生效了没有」
        const createdId = (result.data as { id?: string } | undefined)?.id
        if (createdId) {
          void applyDomainVerify(createdId)
        }
      } else {
        toast.error(
          resolveActionError(
            tAE,
            result.error,
            t("actionFailed"),
            (result as { data?: { workspace?: string } }).data
          )
        )
      }
    } catch {
      toast.error(tc("operationFailed"), { description: tc("retryLater") })
    } finally {
      setDomainBusy(prev => ({ ...prev, [ws.id]: false }))
    }
  }

  // 域名解绑：经确认框触发（原先 X 直连无确认且无防重入）
  async function handleRemoveDomain() {
    if (!removingDomain || removeDomainBusy) return
    setRemoveDomainBusy(true)
    try {
      const result = await removeWorkspaceDomain(removingDomain.id)
      if (result.success) {
        toast.success(t("domainRemoved"))
        loadRef.current()
      } else {
        toast.error(resolveActionError(tAE, result.error, t("actionFailed")))
      }
    } catch {
      toast.error(tc("operationFailed"), { description: tc("retryLater") })
    } finally {
      setRemoveDomainBusy(false)
      setRemovingDomain(null)
    }
  }

  // 探测指定域名并同步结果到本地状态与 toast 提示
  async function applyDomainVerify(domainId: string) {
    setVerifyBusy(prev => ({ ...prev, [domainId]: true }))
    try {
      const result = await verifyWorkspaceDomain(domainId)
      if (result.success && result.data) {
        const { status, verifiedAt } = result.data as {
          status: string
          verifiedAt: string | Date
        }
        setWorkspaces(prev =>
          prev.map(ws => ({
            ...ws,
            domains: ws.domains.map(d =>
              d.id === domainId
                ? { ...d, lastVerifiedStatus: status, lastVerifiedAt: verifiedAt }
                : d
            ),
          }))
        )
        if (status === "ok") {
          toast.success(t("verifyOk"))
        } else if (status === "fallback") {
          toast.warning(t("verifyFallback"))
        } else {
          toast.error(t("verifyUnreachable"))
        }
      } else {
        toast.error(t("verifyFailed"))
      }
    } catch {
      toast.error(t("verifyFailed"))
    } finally {
      setVerifyBusy(prev => ({ ...prev, [domainId]: false }))
    }
  }

  // 探测结果的状态点颜色；未知状态不渲染
  function verifyDotClass(status: string | null | undefined) {
    if (status === "ok") return "bg-emerald-500"
    if (status === "fallback") return "bg-amber-500"
    if (status === "unreachable") return "bg-red-500"
    return ""
  }

  function verifyStatusText(domain: DomainItem) {
    const statusMap: Record<string, string> = {
      ok: t("verifyOk"),
      fallback: t("verifyFallback"),
      unreachable: t("verifyUnreachable"),
    }
    const text =
      (domain.lastVerifiedStatus && statusMap[domain.lastVerifiedStatus]) || ""
    if (text && domain.lastVerifiedAt) {
      return `${text}（${t("verifyAt", {
        time: new Date(domain.lastVerifiedAt).toLocaleString(),
      })}）`
    }
    return text
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            {t("title")}
            <span className="ml-auto">
              <Button
                onClick={() => {
                  setFormMode("create")
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("create")}
              </Button>
            </span>
          </CardTitle>
          <CardDescription className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("desc")}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed text-center">
              <p className="text-sm font-semibold">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyDesc")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {workspaces.map(ws => (
                <div key={ws.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{ws.name}</span>
                        <Badge variant="outline" className="font-mono text-xs">{ws.slug}</Badge>
                        {ws.isDefault && (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3" />
                            {t("default")}
                          </Badge>
                        )}
                        <Badge variant={ws.isPublished ? "secondary" : "destructive"}>
                          {ws.isPublished ? t("published") : t("unpublished")}
                        </Badge>
                      </div>
                      {ws.description && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{ws.description}</p>
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      {!ws.isDefault && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={primaryBusy !== null}
                              onClick={() => handleSetPrimary(ws)}
                            >
                              {primaryBusy === ws.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Star className="mr-1 h-3.5 w-3.5" />
                              )}
                              {t("setPrimary")}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("setPrimaryTip")}</TooltipContent>
                        </Tooltip>
                      )}
                      {/* 默认工作区同样允许编辑名称/描述/发布状态，仅「设为默认」「删除」受限 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormMode("edit")
                          setEditing(ws)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        {tc("edit")}
                      </Button>
                      {!ws.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleting(ws)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 域名绑定 */}
                  <div className="mt-3 rounded-lg bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t("domains")}</span>
                      {ws.domains.length === 0 && (
                        <span className="text-xs text-muted-foreground">{t("noDomains")}</span>
                      )}
                      {ws.domains.map(d => {
                        const statusText = verifyStatusText(d)
                        return (
                          <Badge key={d.id} variant="secondary" className="gap-1 font-mono">
                            {/* 探测状态点：绿=生效 黄=回退默认 红=不可达；悬停显示说明与时间 */}
                            {(verifyDotClass(d.lastVerifiedStatus) || statusText) && (
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${verifyDotClass(d.lastVerifiedStatus) || "bg-muted-foreground/50"}`}
                                title={statusText || undefined}
                              />
                            )}
                            {d.host}
                            <button
                              className="ml-0.5 rounded-full hover:text-primary"
                              disabled={verifyBusy[d.id]}
                              onClick={() => applyDomainVerify(d.id)}
                              aria-label={t("verifyDomain")}
                              title={t("verifyDomain")}
                            >
                              {verifyBusy[d.id] ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              className="rounded-full hover:text-destructive"
                              disabled={removeDomainBusy}
                              onClick={() => setRemovingDomain(d)}
                              aria-label={t("removeDomain")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )
                      })}
                      <span className="ml-auto flex items-center gap-2">
                        <Input
                          className="h-8 w-56 font-mono text-xs"
                          placeholder="zh.example.com"
                          value={domainInput[ws.id] || ""}
                          onChange={e =>
                            setDomainInput(prev => ({ ...prev, [ws.id]: e.target.value }))
                          }
                          onKeyDown={e => {
                            if (e.key === "Enter") handleAddDomain(ws)
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={domainBusy[ws.id] || !(domainInput[ws.id] || "").trim()}
                          onClick={() => handleAddDomain(ws)}
                        >
                          {domainBusy[ws.id] ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {t("addDomain")}
                        </Button>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WorkspaceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                slug: editing.slug,
                description: editing.description,
                isPublished: editing.isPublished,
              }
            : undefined
        }
        onSuccess={() => loadRef.current()}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDesc", { name: deleting?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                // 阻止 Radix 默认关闭：等落库完成后由 finally 关闭，避免「点了没反应」
                e.preventDefault()
                handleDelete()
              }}
            >
              {deleteBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {tc("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(removingDomain)}
        onOpenChange={(open) => !open && !removeDomainBusy && setRemovingDomain(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDomainTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDomainDesc", { host: removingDomain?.host || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDomainBusy}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeDomainBusy}
              onClick={(e) => {
                e.preventDefault()
                handleRemoveDomain()
              }}
            >
              {removeDomainBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {tc("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
