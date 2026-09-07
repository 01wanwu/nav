"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { useTranslations } from "next-intl";
import {
  ExternalLink,
  Globe,
  ImageOff,
  RefreshCw,
  X,
  ZoomIn,
  Pencil,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
// react-markdown 全家桶体积可观：详情弹窗打开时才加载，不进首屏 bundle
const MarkdownContent = dynamic(
  () => import("@/components/markdown-content").then((m) => m.MarkdownContent),
  { ssr: false }
);
import {
  useFaviconService,
  getProxiedFaviconUrl,
  proxyIconUrlIfPossible,
} from "@/hooks/use-favicon-service";
import { useCardDensity } from "@/hooks/use-card-density";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const SiteFormDialog = dynamic(
  () => import("@/components/admin/site-form-dialog").then((m) => m.SiteFormDialog),
  { ssr: false }
);

interface ScreenshotItem {
  id: string;
  displayUrl: string;
  order: number;
}

interface SiteDetailData {
  name: string;
  url: string;
  description: string;
  iconUrl: string | null;
  detailContent: string | null;
  category?: { name: string; slug: string } | null;
  screenshots: ScreenshotItem[];
}

interface SiteDetailDialogProps {
  site: {
    id: string;
    name: string;
    url: string;
    iconUrl: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 站点详情弹窗：宽版左右分栏布局（截图 / Markdown 内容）
// "访问网站"按钮置于头部右上角，点击计入 Visit 统计
export function SiteDetailDialog({
  site,
  open,
  onOpenChange,
}: SiteDetailDialogProps) {
  const router = useRouter();
  const { isAdmin } = useAdminAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const t = useTranslations("siteDetail");
  const tc = useTranslations("common");
  const [detail, setDetail] = useState<SiteDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [lightboxShot, setLightboxShot] = useState<ScreenshotItem | null>(null);
  const { service } = useFaviconService();
  const { density } = useCardDensity();

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/sites/${site.id}/detail`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load site detail");
      const data = await res.json();
      setDetail(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [site.id]);

  useEffect(() => {
    if (open) {
      setDetail(null);
      setLightboxShot(null);
      loadDetail();
    }
  }, [open, loadDetail]);

  const handleVisit = () => {
    if (navigator.sendBeacon) {
      const data = JSON.stringify({ siteId: site.id });
      navigator.sendBeacon(
        "/api/visit",
        new Blob([data], { type: "application/json" }),
      );
    }
    window.open(site.url, "_blank", "noopener,noreferrer");
  };

  const iconSrc = site.iconUrl
    ? proxyIconUrlIfPossible(site.iconUrl)
    : (() => {
        try {
          return getProxiedFaviconUrl(new URL(site.url).hostname, service);
        } catch {
          return null;
        }
      })();

  const screenshots = detail?.screenshots ?? [];
  const hasContent = Boolean(detail?.detailContent?.trim());
  const isCompact = density === "compact";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* 宽版布局：左右分栏，移动端单列堆叠 */}
        <DialogContent className="max-w-[min(96vw,1100px)] w-full gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogTitle className="sr-only">{site.name}</DialogTitle>

          {/* 加载骨架屏 */}
          {loading && (
            <div className="flex min-h-0 min-w-0 max-h-[88vh] flex-col overflow-hidden">
              {/* 头部骨架 */}
              <div className="flex shrink-0 items-center gap-3.5 border-b border-border/60 p-5">
                <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
                <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
              </div>
              {/* 截图区骨架 */}
              <div className="shrink-0 space-y-3 border-b border-border/60 bg-muted/10 px-5 py-4 sm:px-6">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-3 overflow-hidden">
                  <Skeleton className="aspect-video w-56 shrink-0 rounded-lg sm:w-64" />
                  <Skeleton className="aspect-video w-56 shrink-0 rounded-lg sm:w-64" />
                </div>
              </div>
              {/* Markdown 阅读区骨架 */}
              <div className="flex-1 space-y-3 px-5 py-6 sm:px-8">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          )}

          {/* 加载失败 */}
          {loadError && !loading && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6">
              <p className="text-sm text-muted-foreground">{t("loadError")}</p>
              <Button variant="outline" size="sm" onClick={loadDetail}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t("retry")}
              </Button>
            </div>
          )}

          {/* 详情主体：宽版上下分栏（顶部头部 / 截图区 / Markdown 阅读区） */}
          {detail && !loading && (
            <div className="flex min-h-0 min-w-0 max-h-[88vh] flex-col overflow-hidden">
              {/* 顶部头部栏：图标 + 信息 + 右上角访问按钮 */}
              <div className="grid min-w-0 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3.5 border-b border-border/60 p-5">
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center overflow-hidden border border-border/50 bg-muted/40",
                    isCompact
                      ? "h-10 w-10 rounded-md p-1"
                      : "h-12 w-12 rounded-lg p-1.5",
                  )}
                >
                  {iconSrc ? (
                    <Image
                      src={iconSrc}
                      alt={site.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      {detail.name}
                    </h2>
                    {detail.category?.name && (
                      <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px] h-5 rounded-full"
                      >
                        {detail.category.name}
                      </Badge>
                    )}
                  </div>
                  <p
                    className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80"
                    title={detail.url}
                  >
                    {detail.url}
                  </p>
                  {detail.description && (
                    <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">
                      {detail.description}
                    </p>
                  )}
                </div>
                {/* 右上角「访问网站」按钮：放在关闭按钮左侧 */}
                <div className="shrink-0 pr-7 flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        setEditDialogOpen(true);
                      }}
                      className="transition-all duration-200 active:scale-95"
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {tc("edit")}
                    </Button>
                  )}
                  <Button onClick={handleVisit} size="sm">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    {t("visit")}
                  </Button>
                </div>
              </div>

              {/* 截图区：单行横向滚动，张数再多也不撑高、不挤压下方 Markdown 阅读区 */}
              {screenshots.length > 0 && (
                <div className="shrink-0 border-b border-border/60 bg-muted/10 px-5 py-4 sm:px-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("screenshots")}{" "}
                    <span className="font-normal opacity-60">
                      ({screenshots.length})
                    </span>
                  </h3>
                  <div className="native-scroll scrollbar-thin flex gap-3 overflow-x-auto pb-1">
                    {screenshots.map((shot) => (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => setLightboxShot(shot)}
                        className="group relative aspect-video w-56 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-all duration-250 ease-spring hover:scale-[1.03] hover:border-primary/60 hover:shadow-md active:scale-[0.98] sm:w-64"
                      >
                        <ScreenshotImage
                          displayUrl={shot.displayUrl}
                          name={detail.name}
                        />
                        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110">
                          <ZoomIn className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Markdown 阅读区：占满剩余高度，垂直滚动 */}
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
                {hasContent ? (
                  <MarkdownContent content={detail.detailContent!} />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground italic">
                    {t("emptyHint")}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 截图 Lightbox 全屏预览 */}
      <DialogPrimitive.Root
        open={lightboxShot !== null}
        onOpenChange={(o) => !o && setLightboxShot(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-[95vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200">
            <DialogPrimitive.Close className="absolute -top-11 right-0 rounded-md p-2 text-white/80 transition-all duration-200 hover:bg-white/15 hover:text-white hover:rotate-90 active:scale-95">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
            {lightboxShot && (
              <Image
                src={lightboxShot.displayUrl}
                alt={site.name}
                width={1600}
                height={900}
                unoptimized
                className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
              />
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

// 单张截图：加载失败时展示占位样式
function ScreenshotImage({
  displayUrl,
  name,
}: {
  displayUrl: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground/70">
        <ImageOff className="h-5 w-5" />
        <span className="text-[10px]"> unavailable </span>
      </div>
    );
  }

  return (
    <Image
      src={displayUrl}
      alt={name}
      fill
      unoptimized
      loading="lazy"
      onError={() => setFailed(true)}
      className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
    />
  );
}
