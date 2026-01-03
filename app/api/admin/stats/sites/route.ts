import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const [total, published] = await Promise.all([
      prisma.site.count(),
      prisma.site.count({ where: { isPublished: true } }),
    ])

    return NextResponse.json({ total, published })
  } catch (error) {
    console.error("Error fetching site stats:", error)
    return NextResponse.json({ total: 0, published: 0 }, { status: 500 })
  }
}
