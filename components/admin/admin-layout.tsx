"use client"

import { AdminSidebar } from "./admin-sidebar"
import { AdminHeader } from "./admin-header"

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto relative">
          <div className="sticky top-0 z-50">
            <AdminHeader />
          </div>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
