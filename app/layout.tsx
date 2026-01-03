import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider/theme-provider"
import { getSystemSettings } from "@/lib/actions"

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const result = await getSystemSettings()
  const settings = result.success && result.data ? result.data : null

  return {
    title: settings?.siteName || "Conan Nav",
    description: settings?.siteDescription || "简洁现代化的网址导航系统",
    icons: {
      icon: settings?.favicon || "/favicon.ico",
      apple: settings?.favicon || "/apple-touch-icon.png",
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
