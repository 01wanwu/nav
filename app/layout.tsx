import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider/theme-provider"
import { getDisplaySettings } from "@/lib/actions"
import { getCurrentWorkspace } from "@/lib/workspace"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { htmlLang } from "@/lib/i18n"
import { AnimationSync } from "@/components/theme-provider/animation-sync"
import { getAdminSession } from "@/lib/api-auth"
import { AdminAuthProvider } from "@/components/auth/admin-auth-provider"
// 请求级缓存版解析：metadata/body/子布局/页面重复取用同一份工作区与展示设置
import { getCachedCurrentWorkspace, getCachedDisplaySettings } from "@/lib/workspace-render"

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  // 展示配置按当前请求的工作区覆盖（域名绑定 → 默认工作区）
  const settings = await getCachedDisplaySettings()
  const t = await getTranslations("metadata")

  return {
    title: settings?.siteName || "Conan Nav",
    description: settings?.siteDescription || t("descriptionFallback"),
    icons: {
      icon: settings?.favicon || "/favicon.ico",
      apple: settings?.favicon || "/apple-touch-icon.png",
    },
  }
}

// 当前请求对应的工作区 slug，输出为 meta 标记；解析失败时无标记（探测侧按不可达处理）
async function WorkspaceMarker() {
  const workspace = await getCachedCurrentWorkspace()
  return <meta name="workspace" content={workspace.slug} />
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale()
  const settings = await getCachedDisplaySettings()
  const session = await getAdminSession()
  const initialIsAdmin = Boolean(session)

  return (
    <html lang={htmlLang(locale)} data-animations={settings?.enableAnimations !== false ? "true" : "false"} suppressHydrationWarning>
      <head>
        {/*
          esbuild keepNames 兜底：Vercel / Cloudflare（OpenNext）构建链会把
          next-themes 的主题引导内联脚本改写为带 __name(fn, "fn") 调用的形式，
          但该 helper 只存在于服务端 bundle，浏览器执行内联脚本时抛
          ReferenceError: __name is not defined，水合整体失败（表现为回到顶部
          按钮不出现等交互失效）。此处最早注入无操作 polyfill：
          未被改写的环境不受影响，被改写的环境恢复可用。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: 'window.__name=window.__name||function(f){return f};',
          }}
        />
        {/* 当前请求渲染的工作区标识（机器可读），供管理后台域名反向探测比对 */}
        <WorkspaceMarker />
      </head>
      <body className={inter.className}>
        {/* 资源提示：提前建立第三方连接，降低图标接口的首字节延迟（诗词接口 preconnect 随插件化移除）。
            管理员自定义代码（头部/尾部）已迁移至前台布局 app/(public)/layout.tsx，仅对导航页注入 */}
        <link rel="dns-prefetch" href="https://favicon.im" />
        <link rel="dns-prefetch" href="https://www.google.com" />
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AdminAuthProvider initialIsAdmin={initialIsAdmin}>
              {children}
              <SonnerToaster position="bottom-right" richColors />
              <AnimationSync />
            </AdminAuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
