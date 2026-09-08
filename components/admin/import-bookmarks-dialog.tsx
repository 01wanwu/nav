"use client"

import { useState, useRef } from "react"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Upload, AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { importBookmarks } from "@/lib/actions"
import { useTranslations } from "next-intl"
import { resolveActionError } from "@/lib/action-error"

interface ImportBookmarksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportBookmarksDialog({
  open,
  onOpenChange,
}: ImportBookmarksDialogProps) {
  const router = useRouter()
  const t = useTranslations("admin.import")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'overwrite' | 'append'>('append')
  const [isImporting, setIsImporting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 验证文件类型
      const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm')
      const isJson = file.name.endsWith('.json')

      if (!isHtml && !isJson) {
        toast.error(t("fileFormatError"), {
          description: t("fileFormatErrorDesc"),
        })
        return
      }
      setSelectedFile(file)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error(t("noFileSelected"), {
        description: t("noFileSelectedDesc"),
      })
      return
    }

    // 如果是覆盖模式，显示确认对话框
    if (importMode === 'overwrite') {
      setShowConfirmDialog(true)
      return
    }

    // 追加模式直接导入
    await performImport()
  }

  const performImport = async () => {
    if (!selectedFile) return

    setIsImporting(true)
    setShowConfirmDialog(false)

    try {
      const isJson = selectedFile.name.endsWith('.json')
      const text = await selectedFile.text()

      let result
      if (isJson) {
        // JSON格式：调用数据导入API
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('mode', importMode)

        const response = await fetch('/api/data/import', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()
        result = data
      } else {
        // HTML格式：调用书签导入函数
        result = await importBookmarks(text, importMode)
      }

      if (result.success) {
        toast.success(t("importSuccess"), {
          description: result.message,
        })
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        // 刷新数据并关闭对话框
        router.refresh()
        onOpenChange(false)
      } else {
        toast.error(t("importFailed"), {
          description: resolveActionError(tAE, result.error, t("importFailed")),
        })
      }
    } catch (error) {
      toast.error(t("importFailed"), {
        description: error instanceof Error ? error.message : t("unknownError"),
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* 导入进行中阻止 Esc/点遮罩关闭：后台任务仍在跑，关窗会让用户误以为已取消 */}
        <DialogContent
          className="sm:max-w-[600px]"
          onEscapeKeyDown={(e) => isImporting && e.preventDefault()}
          onInteractOutside={(e) => isImporting && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* 文件选择 - 主要操作 */}
            <div className="space-y-3">
              <label className="text-sm font-medium">{t("step1")}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.json"
                onChange={handleFileSelect}
                className="hidden"
                id="bookmark-file"
              />
              <label htmlFor="bookmark-file">
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed border-2 transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99] group"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  type="button"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5" />
                    <div className="text-center">
                      <p className="font-medium">
                        {selectedFile ? selectedFile.name : t("selectFile")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFile
                          ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                          : t("formatHint")}
                      </p>
                    </div>
                  </div>
                </Button>
              </label>
            </div>

            {/* 导入模式选择 */}
            <div className="space-y-3">
              <label className="text-sm font-medium">{t("step2")}</label>

              {/* 追加模式 */}
              <button
                onClick={() => setImportMode('append')}
                className={`w-full text-left p-4 border rounded-lg transition-all duration-150 active:scale-[0.99] ${
                  importMode === 'append'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
                disabled={isImporting}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                    importMode === 'append'
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  }`} />
                  <div>
                    <p className="font-medium">{t("appendTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("appendDesc")}
                    </p>
                  </div>
                </div>
              </button>

              {/* 覆盖模式 */}
              <button
                onClick={() => setImportMode('overwrite')}
                className={`w-full text-left p-4 border rounded-lg transition-all duration-150 active:scale-[0.99] ${
                  importMode === 'overwrite'
                    ? 'border-destructive bg-destructive/5'
                    : 'border-border hover:bg-muted/50'
                }`}
                disabled={isImporting}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                    importMode === 'overwrite'
                      ? 'border-destructive bg-destructive'
                      : 'border-muted-foreground'
                  }`} />
                  <div>
                    <p className="font-medium">{t("overwriteTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("overwriteDesc")}
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* 覆盖模式警告 */}
            {importMode === 'overwrite' && selectedFile && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-semibold">{t("warningTitle")}</AlertTitle>
                <AlertDescription className="mt-2">
                  {t("warningPart1")}<strong>{t("overwriteMode")}</strong>{t("warningPart2")}
                  {t("irreversible")}{t("warningPart3")}
                </AlertDescription>
              </Alert>
            )}

            {/* 格式说明 */}
            <Alert>
              <AlertTitle className="font-semibold">{t("formatTitle")}</AlertTitle>
              <AlertDescription className="mt-2 text-sm space-y-3">
                <div>
                  <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">{t("jsonFormatTitle")}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t("jsonFormatDesc")}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">{t("chromeFormatTitle")}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t("chromeFormatDesc")}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
            {/* 大数据量导入提示：分批写入耗时不短，明确告知用户不要中途关闭 */}
            {isImporting && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                  {t("largeImportTip")}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("importing")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("importBtn")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 覆盖确认对话框 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("confirmOverwriteTitle")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 pt-2">
            <div className="font-semibold text-destructive">
              {t("confirmOverwriteLead")}
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>{t("deleteSites")}</li>
              <li>{t("deleteCategories")}</li>
              <li>{t("deleteVisits")}</li>
              <li>{t("irreversibleItemPre")}<span className="font-semibold">{t("irreversibleItem")}</span></li>
            </ul>
            <div className="text-sm font-medium pt-2">
              {t("backupAdvice")}
            </div>
            <div className="mt-2 p-2 rounded bg-muted border-l-2 border-muted-foreground">
              <p className="text-xs text-muted-foreground">
                {t("tipDesc")}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={performImport}
              disabled={isImporting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("importing")}
                </>
              ) : (
                t("confirmOverwrite")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
