import { NextRequest, NextResponse } from 'next/server'
import { importData } from '@/lib/actions'
import { getAdminSession } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const mode = (formData.get('mode') as string) === 'overwrite' ? 'overwrite' : 'append'

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: '未选择文件' },
        { status: 400 }
      )
    }

    // 大小上限：文件会整体读入内存做 JSON.parse，超大文件可造成内存尖峰。
    // 默认 10MB；自部署可通过 MAX_IMPORT_MB 放宽（1~500，非法值回退默认）
    const maxImportMb = Math.min(
      Math.max(parseInt(process.env.MAX_IMPORT_MB || '10', 10) || 10, 1),
      500
    )
    if (file.size > maxImportMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `文件过大（上限 ${maxImportMb}MB，可通过 MAX_IMPORT_MB 环境变量调整）` },
        { status: 413 }
      )
    }

    // 读取文件内容
    const text = await file.text()

    // 解析JSON
    let jsonData
    try {
      jsonData = JSON.parse(text)
    } catch (error) {
      return NextResponse.json(
        { error: 'JSON格式错误，请检查文件内容' },
        { status: 400 }
      )
    }

    // 导入数据（联合返回类型：失败分支带 error，成功分支带 message/count）
    const result = await importData(jsonData, mode)

    if (!result.success) {
      return NextResponse.json(
        { error: (result as { error?: string }).error || '导入失败' },
        { status: 500 }
      )
    }

    const ok = result as { message?: string; importedCount?: number }
    return NextResponse.json({
      success: true,
      message: ok.message,
      importedCount: ok.importedCount,
    })
  } catch (error) {
    console.error('Error importing data:', error)
    return NextResponse.json(
      { error: '导入失败，请检查文件格式' },
      { status: 500 }
    )
  }
}
