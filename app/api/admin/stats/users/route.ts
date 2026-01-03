import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    // 统计独立访客数（基于唯一IP地址）
    const uniqueIPs = await prisma.visit.findMany({
      select: {
        ipAddress: true,
      },
      where: {
        ipAddress: {
          not: null,
        },
      },
      distinct: ['ipAddress'],
    })

    const total = uniqueIPs.length

    return NextResponse.json({ total })
  } catch (error) {
    console.error("Error fetching visitor stats:", error)
    return NextResponse.json({ total: 0 }, { status: 500 })
  }
}
