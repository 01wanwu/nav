import { NextRequest, NextResponse } from 'next/server'
import { exportData } from '@/lib/actions'
import { getAdminSession } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // mode=workspace（默认）：导出当前选中工作区；mode=full：含工作区结构与域名绑定的全量备份
    const mode = request.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'workspace'
    const result = await exportData(mode)

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    const suffix = mode === 'full' ? 'full_backup' : 'workspace_backup'
    // 紧凑序列化（不做美化缩进）：导出体积含截图 base64，缩进会额外膨胀 30%~50%
    return new NextResponse(JSON.stringify(result.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Disposition': `attachment; filename="nav_${suffix}_${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (error) {
    console.error('Error exporting data:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}
