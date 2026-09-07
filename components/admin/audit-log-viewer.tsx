"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, ScrollText, Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { getAuditLogs } from "@/lib/actions"
import { Input } from "@/components/ui/input"

interface AuditLogEntry {
  id: string
  actorId: string
  actorEmail: string
  action: string
  entityType: string
  entityId: string | null
  detail: string | null
  createdAt: string | Date
}

const PAGE_SIZE = 20

// 与 getAuditLogs 的白名单保持一致；未覆盖的类型原样展示
const ENTITY_TYPES = [
  "user",
  "site",
  "category",
  "workspace",
  "domain",
  "plugin",
  "settings",
] as const

export function AuditLogViewer() {
  const t = useTranslations("admin.auditLog")
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [action, setAction] = useState<string>("ALL")
  const [entityType, setEntityType] = useState<string>("ALL")
  // 提交后的生效关键字与输入框草稿分离：避免每次键入都触发查询
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")

  const loadLogs = useCallback(
    async (
      targetPage: number,
      targetAction: string,
      targetEntityType: string,
      targetSearch: string
    ) => {
      setLoading(true)
      try {
        const result = await getAuditLogs({
          page: targetPage,
          pageSize: PAGE_SIZE,
          action: targetAction === "ALL" ? undefined : targetAction,
          entityType: targetEntityType === "ALL" ? undefined : targetEntityType,
          search: targetSearch || undefined,
        })
        if (result && result.success) {
          setLogs(result.data)
          setTotalPages(result.pagination.totalPages)
          setPage(result.pagination.page)
        } else {
          setLogs([])
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    loadLogs(1, "ALL", "ALL", "")
  }, [loadLogs])

  const handleSearch = () => {
    setSearch(searchInput)
    loadLogs(1, action, entityType, searchInput)
  }

  const actionBadgeVariant = (a: string) =>
    a === "DELETE" ? "destructive" : a === "CREATE" ? "default" : "secondary"

  // 对象类型展示为本地化文案；未知类型回退原值。
  // next-intl 的 Translator 泛型无法结构化匹配动态 key，
  // 与 lib/action-error.ts 同口径做最小能力假设（has + 调用）
  const entityTypeLabel = (type: string) => {
    const key = `entity${type.charAt(0).toUpperCase()}${type.slice(1)}`
    const translator = t as unknown as {
      has?: (key: string) => boolean
      (key: string): string
    }
    try {
      if (translator.has?.(key)) return translator(key)
    } catch {
      // 映射缺失等异常退回原值
    }
    return type
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("searchPlaceholder")}
          />
          <Button variant="outline" size="icon" onClick={handleSearch} aria-label={t("search")}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            loadLogs(1, v, entityType, search)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filterAll")}</SelectItem>
            <SelectItem value="CREATE">{t("actionCreate")}</SelectItem>
            <SelectItem value="UPDATE">{t("actionUpdate")}</SelectItem>
            <SelectItem value="DELETE">{t("actionDelete")}</SelectItem>
            <SelectItem value="LOGIN">{t("actionLogin")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={entityType}
          onValueChange={(v) => {
            setEntityType(v)
            loadLogs(1, action, v, search)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filterAllTypes")}</SelectItem>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {entityTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thTime")}</TableHead>
              <TableHead>{t("thActor")}</TableHead>
              <TableHead>{t("thAction")}</TableHead>
              <TableHead>{t("thEntity")}</TableHead>
              <TableHead>{t("thDetail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <ScrollText className="h-5 w-5 mx-auto mb-2 opacity-50" />
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.actorEmail}</TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant(log.action)}>
                      {t(`action${log.action.charAt(0)}${log.action.slice(1).toLowerCase()}` as never)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-muted-foreground">{entityTypeLabel(log.entityType)}</span>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {log.detail || (log.entityId ?? "-")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => loadLogs(page - 1, action, entityType, search)}
          >
            {t("prevPage")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => loadLogs(page + 1, action, entityType, search)}
          >
            {t("nextPage")}
          </Button>
        </div>
      )}
    </div>
  )
}
