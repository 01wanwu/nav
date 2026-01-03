import { NextRequest, NextResponse } from "next/server"
import { updateSystemSettings, getSystemSettings } from "@/lib/actions"

export async function GET() {
  try {
    const result = await getSystemSettings()
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证必填字段
    if (body.siteName && body.siteName.trim().length === 0) {
      return NextResponse.json({ error: "网站名称不能为空" }, { status: 400 })
    }

    // 只提取允许更新的字段，排除 id 和其他只读字段
    const {
      id,
      createdAt,
      updatedAt,
      ...allowedFields
    } = body

    const result = await updateSystemSettings(allowedFields)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Error updating system settings:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
