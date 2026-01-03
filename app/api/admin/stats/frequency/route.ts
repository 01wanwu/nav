import { NextRequest, NextResponse } from "next/server"
import { getVisitFrequency } from "@/lib/actions"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)

    const result = await getVisitFrequency(days)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ frequency: result.data })
  } catch (error) {
    console.error("Error fetching visit frequency:", error)
    return NextResponse.json({ error: "Failed to fetch visit frequency" }, { status: 500 })
  }
}
