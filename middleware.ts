import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  LEGACY_COOKIE_NAMES,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session"

// 定义受保护的路由
// 精确匹配 /admin 本身与 /admin/ 子路径：避免把 /administrator 等无关前缀路径
// 也重定向进登录页
const isAdminPath = (pathname: string) =>
  pathname === "/admin" || pathname.startsWith("/admin/")
const protectedRoutes = ["/admin"]
const authRoutes = ["/admin/login"]

// 管理 API：统一在 middleware 层鉴权。
// 此前 matcher 只覆盖 /admin 页面，/api/admin/* 完全裸奔，
// 未登录即可篡改系统设置、读取数据库连接信息（越权漏洞）
const protectedApiRoutes = ["/api/admin"]
// 登录接口自身放行（自身的凭据校验与限流见 app/api/admin/login/route.ts）
const apiAuthExempt = ["/api/admin/login", "/api/admin/status"]

// 工作区预览参数是否启用：开发模式或显式开启（预览环境无子域名时调试用）
const workspacePreviewEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.ENABLE_WORKSPACE_PREVIEW === "true"

// ---- CSRF 防护 ----
// 会话 cookie 含 SameSite=None 分支（跨站 iframe 场景），会被跨站请求携带，
// 而 Route Handler 不享受 Server Action 的内建 Origin 校验。
// 浏览器对 POST/PUT/PATCH/DELETE 的 fetch 请求总是附带 Origin 头（含同源），
// 与请求 Host 比对即可识别跨站伪造；Origin 缺失时放行：
// 非浏览器客户端不构成 CSRF 风险，且保留 API 直连能力。
// 只比对 Host 头：Host 属浏览器 forbidden header，跨站页面无法伪造；
// x-forwarded-host 可被攻击者随意设置（非 forbidden header），
// 若参与比对，跨站 fetch 同时带上 Origin: evil.com + X-Forwarded-Host: evil.com 即可绕过。
// 部署要求：反向代理需将 Host 设为公开域名（Nginx `proxy_set_header Host $host`、
// Caddy 默认行为均满足）。
function isSameOriginApiRequest(request: NextRequest): boolean {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  ) {
    return true
  }
  const origin = request.headers.get("origin")
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  if (!originHost) return false
  const requestHost = request.headers.get("host")?.trim() || ""
  return requestHost.toLowerCase() === originHost.toLowerCase()
}

// 工作区域名解析相关逻辑运行在应用层（lib/workspace.ts），middleware 只做
// 纯字符串处理并注入请求头（Edge Runtime 无法使用 Prisma）
function buildWorkspaceHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)

  // Host 提取：x-forwarded-host 优先（反代/Cloudflare 场景），回退 host；
  // 去端口、转小写由应用层 normalizeHost 统一完成，这里保留原始值传递。
  // 与 preview 头对称：先无条件删除客户端自带的同名头（HTTP 头可被伪造），
  // 本端拿不到 Host 时不能放行客户端注入的值
  headers.delete("x-workspace-host")
  const rawHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    ""
  if (rawHost) {
    headers.set("x-workspace-host", rawHost.toLowerCase())
  }

  // 开发/预览模式：?__workspace=slug 模拟子域名访问指定工作区。
  // 无论如何先删除客户端自带的同名头（HTTP 头可被任意伪造）：生产环境预览关闭时
  // 若不删除，伪造该头即可绕过域名绑定查看任意已发布工作区的内容
  headers.delete("x-workspace-preview")
  if (workspacePreviewEnabled) {
    const previewSlug = request.nextUrl.searchParams.get("__workspace")
    if (previewSlug) {
      headers.set("x-workspace-preview", previewSlug)
    }
  }

  return headers
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ---- 浏览器扩展 API：Bearer 令牌鉴权（无 Cookie），CSRF 不适用，直接放行 ----
  if (pathname.startsWith("/api/extension")) {
    return NextResponse.next({
      request: { headers: buildWorkspaceHeaders(request) },
    })
  }

  // ---- CSRF：拒绝跨站伪造的 API 写请求 ----
  if (pathname.startsWith("/api/") && !isSameOriginApiRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin request rejected" },
      { status: 403 }
    )
  }

  // ---- 管理 API 鉴权：未认证返回 401 JSON（不重定向） ----
  const isProtectedApi = protectedApiRoutes.some((route) =>
    pathname.startsWith(route)
  )
  if (isProtectedApi) {
    const isExempt = apiAuthExempt.some((route) => pathname.startsWith(route))
    if (isExempt) {
      return NextResponse.next({
        request: { headers: buildWorkspaceHeaders(request) },
      })
    }
    // 校验签名会话：验签 + 过期检查均由 verifySessionToken 完成，
    // 明文伪造 user_id/user_role cookie 无法通过此处
    const apiToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const apiSession = apiToken ? await verifySessionToken(apiToken) : null
    if (!apiSession || apiSession.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.next({
      request: { headers: buildWorkspaceHeaders(request) },
    })
  }

  // ---- 页面路由 ----
  const isProtectedRoute = isAdminPath(pathname)

  // 检查是否是认证路由（登录页）
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // 校验签名会话：验签 + 过期检查均由 verifySessionToken 完成，
  // 明文伪造 user_id/user_role cookie 不再能通过此处
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  const isAdmin = session !== null && session.role === "ADMIN"

  const hasLegacyCookies = LEGACY_COOKIE_NAMES.some((name) =>
    request.cookies.has(name)
  )

  // 如果已登录且访问登录页，重定向到 dashboard
  if (isAdmin && isAuthRoute) {
    const response = NextResponse.redirect(
      new URL("/admin/dashboard", request.url)
    )
    if (hasLegacyCookies) {
      for (const name of LEGACY_COOKIE_NAMES) response.cookies.delete(name)
    }
    return response
  }

  // 如果未登录（或会话无效）且访问受保护的路由，重定向到登录页
  if (!isAdmin && isProtectedRoute && !isAuthRoute) {
    const loginUrl = new URL("/admin/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    const response = NextResponse.redirect(loginUrl)
    // 会话过期/无效：清除后由重新登录重建
    if (token) response.cookies.delete(SESSION_COOKIE_NAME)
    // 清除旧版明文会话 cookie（数据库重建/切换部署模式留下的脏会话），
    // 让登录页重新登录后自愈
    for (const name of LEGACY_COOKIE_NAMES) {
      if (request.cookies.has(name)) response.cookies.delete(name)
    }
    return response
  }

  return NextResponse.next({
    request: { headers: buildWorkspaceHeaders(request) },
  })
}

export const config = {
  // 工作区域名解析需要覆盖全部动态路由；排除静态资源、健康检查，
  // 以及全站 QPS 最高的 api/icon 与 api/visit —— 两者不读注入的工作区头
  // （icon 自带白名单校验、visit 只读原始转发头），无需过 middleware
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/icon|api/visit|robots.txt|sitemap.xml).*)",
  ],
}
