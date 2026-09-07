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
import { Loader2, ScrollText } from "lucide-react"
import { useTranslations } from "next-intl"
import { getAuditLogs } from "@/lib/actions"

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

export function AuditLogViewer() {
  const t = useTranslations("admin.auditLog")
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [action, setAction] = useState<string>("ALL")

  const loadLogs = useCallback(async (targetPage: number, targetAction: string) => {
    setLoading(true)
    try {
      const result = await getAuditLogs({
        page: targetPage,
        pageSize: PAGE_SIZE,
        action: targetAction === "ALL" ? undefined : targetAction,
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
  }, [])

  useEffect(() => {
    loadLogs(1, "ALL")
  }, [loadLogs])

  const actionBadgeVariant = (a: string) =>
    a === "DELETE" ? "destructive" : a === "CREATE" ? "default" : "secondary"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            loadLogs(1, v)
          }}
        >
          <SelectTrigger className="w-40">
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
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thTime")}</TableHead>
              <TableHead>{t("thActor")}</TableHead>
              <TableHead>{t("thAction")}</TableHead>
              <TableHead>{t("thDetail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
                  <TableCell className="max-w-md truncate">
                    {log.detail || `${log.entityType} ${log.entityId || ""}`}
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
            onClick={() => loadLogs(page - 1, action)}
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
            onClick={() => loadLogs(page + 1, action)}
          >
            {t("nextPage")}
          </Button>
        </div>
      )}
    </div>
  )
}
