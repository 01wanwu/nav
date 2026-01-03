import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const total = await prisma.category.count()

    return NextResponse.json({ total })
  } catch (error) {
    console.error("Error fetching category stats:", error)
    return NextResponse.json({ total: 0 }, { status: 500 })
  }
}
