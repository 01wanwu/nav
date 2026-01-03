import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

interface DatabaseInfo {
  type: string
  status: "connected" | "error"
  host?: string
  port?: number
  database?: string
  username?: string
}

export async function GET() {
  try {
    // 测试数据库连接
    await prisma.$queryRaw`SELECT 1`

    // 从 DATABASE_URL 解析数据库信息
    const databaseUrl = process.env.DATABASE_URL || ""
    let dbInfo: DatabaseInfo = {
      type: "PostgreSQL",
      status: "connected",
    }

    if (databaseUrl) {
      try {
        // 解析 PostgreSQL 连接字符串: postgresql://user:password@host:port/database
        const match = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
        if (match) {
          const [, username, , host, port, database] = match
          dbInfo = {
            ...dbInfo,
            host,
            port: parseInt(port),
            database,
            username,
          }
        }
      } catch (error) {
        console.error("Failed to parse DATABASE_URL:", error)
      }
    }

    return NextResponse.json(dbInfo)
  } catch (error) {
    console.error("Database connection error:", error)
    return NextResponse.json({
      type: "PostgreSQL",
      status: "error" as const,
    })
  }
}
