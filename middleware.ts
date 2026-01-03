import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 定义受保护的路由
const protectedRoutes = ["/admin"]
const authRoutes = ["/admin/login"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 检查是否是受保护的路由
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // 检查是否是认证路由（登录页）
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // 获取用户 session
  const userId = request.cookies.get("user_id")?.value
  const userRole = request.cookies.get("user_role")?.value

  // 如果已登录且访问登录页，重定向到 dashboard
  if (userId && isAuthRoute) {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url))
  }

  // 如果未登录且访问受保护的路由，重定向到登录页
  if (!userId && isProtectedRoute && !isAuthRoute) {
    const loginUrl = new URL("/admin/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 如果已登录但不是管理员，重定向到首页
  if (userId && isProtectedRoute && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
