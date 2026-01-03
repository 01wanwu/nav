"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { Loader2, BarChart3, TrendingUp } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VisitFrequencyChart } from "@/components/admin/charts/visit-frequency-chart"

interface VisitStats {
  topSites: Array<{
    id: string
    name: string
    url: string
    description: string
    iconUrl: string | null
    visitCount: number
    category: {
      name: string
    }
  }>
  totalVisits: number
}

interface FrequencyData {
  frequency: Array<{
    date: string
    count: number
  }>
}

interface SiteStats {
  title: string
  value: number
  loading: boolean
}

type TimeRange = 0 | 7 | 30 | 90

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null)
  const [frequencyData, setFrequencyData] = useState<FrequencyData | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>(30)
  const [siteStats, setSiteStats] = useState<SiteStats[]>([
    { title: "网站总数", value: 0, loading: true },
    { title: "分类总数", value: 0, loading: true },
    { title: "独立访客数", value: 0, loading: true },
    { title: "总访问量", value: 0, loading: true },
  ])

  // 获取时间范围描述
  const getTimeRangeLabel = (days: TimeRange) => {
    if (days === 0) return "全部"
    return `最近${days}天`
  }

  // 加载统计数据
  useEffect(() => {
    async function loadStats() {
      try {
        const [sitesRes, categoriesRes, usersRes, visitsRes, frequencyRes] = await Promise.all([
          fetch("/api/admin/stats/sites"),
          fetch("/api/admin/stats/categories"),
          fetch("/api/admin/stats/users"),
          fetch(`/api/admin/stats/visits?days=${timeRange}`),
          fetch(`/api/admin/stats/frequency?days=${timeRange}`),
        ])

        const sitesData = await sitesRes.json()
        const categoriesData = await categoriesRes.json()
        const usersData = await usersRes.json()
        const visitsData = await visitsRes.json()
        const frequencyData = await frequencyRes.json()

        setSiteStats([
          { title: "网站总数", value: sitesData.total || 0, loading: false },
          { title: "分类总数", value: categoriesData.total || 0, loading: false },
          { title: "独立访客数", value: usersData.total || 0, loading: false },
          { title: "总访问量", value: visitsData.totalVisits || 0, loading: false },
        ])

        setVisitStats(visitsData)
        setFrequencyData(frequencyData)
      } catch (error) {
        console.error("Failed to load stats:", error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">数据统计</h1>
        <p className="text-muted-foreground">查看网站访问数据和统计信息</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {siteStats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stat.loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 时间范围选择 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">时间范围：</label>
        <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value) as TimeRange)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择时间范围" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">全部</SelectItem>
            <SelectItem value="7">最近7天</SelectItem>
            <SelectItem value="30">最近30天</SelectItem>
            <SelectItem value="90">最近90天</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 访问排行 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            网站访问排行
          </CardTitle>
          <CardDescription>{getTimeRangeLabel(timeRange)}用户访问最多的网站</CardDescription>
        </CardHeader>
        <CardContent>
          {visitStats && visitStats.topSites.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">排名</TableHead>
                  <TableHead>网站名称</TableHead>
                  <TableHead className="text-right">访问次数</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {visitStats.topSites.map((site, index) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">
                    {index === 0 && (
                      <Badge variant="default">1</Badge>
                    )}
                    {index === 1 && (
                      <Badge variant="secondary">2</Badge>
                    )}
                    {index === 2 && (
                      <Badge variant="secondary">3</Badge>
                    )}
                    {index > 2 && (
                      <span className="text-muted-foreground">#{index + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {site.iconUrl && (
                        <img
                          src={site.iconUrl}
                          alt={site.name}
                          className="h-5 w-5 rounded"
                        />
                      )}
                      <span className="font-medium">{site.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold">{site.visitCount.toLocaleString()}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            暂无访问数据
          </div>
        )}
      </CardContent>
    </Card>

      {/* 访问频次统计 */}
      {frequencyData && (
        <VisitFrequencyChart
          data={frequencyData.frequency || []}
          timeRange={timeRange}
        />
      )}
    </div>
  )
}
