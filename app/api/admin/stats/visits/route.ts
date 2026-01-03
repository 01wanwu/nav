import { NextRequest, NextResponse } from "next/server"
import { getVisitStats } from "@/lib/actions"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)

    const result = await getVisitStats(days)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Error fetching visit stats:", error)
    return NextResponse.json({ error: "Failed to fetch visit stats" }, { status: 500 })
  }
}
