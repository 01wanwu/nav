"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
import { useMemo } from "react"

interface VisitFrequencyChartProps {
  data: Array<{
    date: string
    count: number
  }>
  timeRange: number
}

export function VisitFrequencyChart({ data, timeRange }: VisitFrequencyChartProps) {
  // 填充缺失的日期数据
  const displayData = useMemo(() => {
    if (timeRange === 0) {
      // 全部数据模式，不填充
      return data
    }

    // 计算日期范围
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - timeRange + 1)

    // 创建日期映射
    const dateMap = new Map<string, number>()
    data.forEach(item => {
      const dateKey = item.date.split('T')[0] // YYYY-MM-DD
      dateMap.set(dateKey, item.count)
    })

    // 填充所有日期
    const filledData: Array<{ date: string; count: number }> = []
    for (let i = 0; i < timeRange; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      const dateKey = date.toISOString().split('T')[0]
      filledData.push({
        date: dateKey,
        count: dateMap.get(dateKey) || 0
      })
    }

    return filledData
  }, [data, timeRange])

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  // 格式化完整日期
  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekDay = weekDays[date.getDay()]
    return `${year}年${month}月${day}日 ${weekDay}`
  }

  // 计算总访问量
  const totalVisits = data.reduce((sum, item) => sum + item.count, 0)

  // 计算合理的 Y 轴最大值
  const maxCount = Math.max(...displayData.map(d => d.count), 0)
  const yAxisMax = maxCount > 0 ? Math.ceil(maxCount * 1.2) : 10 // 留20%空间，最小为10

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          访问频次统计
        </CardTitle>
        <CardDescription>
          {timeRange === 0 ? "全部" : `最近${timeRange}天`}共 {totalVisits.toLocaleString()} 次访问
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={displayData}>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, yAxisMax]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => {
                  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
                  return value.toString()
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
                labelFormatter={(label) => formatFullDate(label)}
                formatter={(value: number | undefined) => [
                  value ? `${value} 次` : '0 次',
                  '访问量',
                ]}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            暂无数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}
