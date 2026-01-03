import { NextRequest, NextResponse } from "next/server"
import { recordVisit } from "@/lib/actions"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { siteId } = body

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 })
    }

    const result = await recordVisit(siteId, request)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error recording visit:", error)
    return NextResponse.json({ error: "Failed to record visit" }, { status: 500 })
  }
}
