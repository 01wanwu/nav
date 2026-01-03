import { NextResponse } from "next/server"
import { getSystemSettings } from "@/lib/actions"

export async function GET() {
  try {
    const result = await getSystemSettings()
    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.error || "Failed to fetch settings" }, { status: 400 })
    }
    // 只返回前台需要的公开信息
    const { id, ...publicSettings } = result.data
    return NextResponse.json(publicSettings)
  } catch (error) {
    console.error("Error fetching public settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}
