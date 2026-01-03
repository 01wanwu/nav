"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { getSystemSettings, updateSystemSettings } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"

interface SystemSettingsData {
  id: string
  siteName: string
  siteDescription: string
  siteLogo: string | undefined
  favicon: string | undefined
  pageSize: number
  showFooter: boolean
  footerCopyright: string
  footerLinks: Array<{ name: string; url: string }>
  showAdminLink: boolean
  enableVisitTracking: boolean
  githubUrl: string | undefined
  showIcp: boolean
  icpNumber: string | undefined
  icpLink: string | undefined
}

export default function AdminSettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<SystemSettingsData>({
    id: "",
    siteName: "Conan Nav",
    siteDescription: "简洁现代化的网址导航系统",
    siteLogo: undefined,
    favicon: undefined,
    pageSize: 20,
    showFooter: true,
    footerCopyright: `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
    footerLinks: [],
    showAdminLink: true,
    enableVisitTracking: true,
    githubUrl: undefined,
    showIcp: false,
    icpNumber: undefined,
    icpLink: undefined,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // 加载数据
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const result = await getSystemSettings()
    if (result.success && result.data) {
      setSettings({
        ...result.data,
        siteLogo: result.data.siteLogo || undefined,
        favicon: result.data.favicon || undefined,
        footerLinks: (result.data.footerLinks as Array<{ name: string; url: string }>) || [],
        githubUrl: result.data.githubUrl || undefined,
        showIcp: result.data.showIcp || false,
        icpNumber: result.data.icpNumber || undefined,
        icpLink: result.data.icpLink || undefined,
      })
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const result = await updateSystemSettings(settings)
      if (result.success) {
        toast({
          title: "保存成功",
          description: "系统设置已更新",
        })
        setTimeout(() => window.location.reload(), 500)
      } else {
        toast({
          variant: "destructive",
          title: "保存失败",
          description: result.error || "保存设置失败，请稍后重试",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "保存失败",
        description: "发生错误，请稍后重试",
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const addFooterLink = () => {
    setSettings({
      ...settings,
      footerLinks: [...settings.footerLinks, { name: "", url: "" }],
    })
  }

  const removeFooterLink = (index: number) => {
    const newLinks = settings.footerLinks.filter((_, i) => i !== index)
    setSettings({ ...settings, footerLinks: newLinks })
  }

  const updateFooterLink = (index: number, field: "name" | "url", value: string) => {
    const newLinks = [...settings.footerLinks]
    newLinks[index][field] = value
    setSettings({ ...settings, footerLinks: newLinks })
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">系统管理</h1>
        <p className="text-muted-foreground">管理系统配置和网站设置</p>
      </div>

      {/* 系统设置 */}
      <div className="space-y-4">
        {/* 基本设置 */}
        <Card>
          <CardHeader>
            <CardTitle>基本设置</CardTitle>
            <CardDescription>配置网站基本信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">网站名称</Label>
              <Input
                id="site-name"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                placeholder="请输入网站名称"
              />
              <p className="text-sm text-muted-foreground">
                显示在浏览器标签和页面标题中
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-description">网站描述</Label>
              <Textarea
                id="site-description"
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                placeholder="请输入网站描述"
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                网站简介，有助于搜索引擎优化（SEO）
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* 图片设置 */}
        <Card>
          <CardHeader>
            <CardTitle>图片设置</CardTitle>
            <CardDescription>设置网站 Logo 和 Favicon</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-logo">网站 Logo URL</Label>
              <Input
                id="site-logo"
                value={settings.siteLogo || ""}
                onChange={(e) => setSettings({ ...settings, siteLogo: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-sm text-muted-foreground">
                建议尺寸：200x60 像素，支持 PNG、JPG、SVG 格式
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="favicon">Favicon URL</Label>
              <Input
                id="favicon"
                value={settings.favicon || ""}
                onChange={(e) => setSettings({ ...settings, favicon: e.target.value })}
                placeholder="https://example.com/favicon.ico"
              />
              <p className="text-sm text-muted-foreground">
                浏览器标签图标，建议尺寸：32x32 或 16x16 像素
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* 链接设置 */}
        <Card>
          <CardHeader>
            <CardTitle>链接设置</CardTitle>
            <CardDescription>配置外部链接</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="github-url">GitHub 仓库地址</Label>
              <Input
                id="github-url"
                value={settings.githubUrl || ""}
                onChange={(e) => setSettings({ ...settings, githubUrl: e.target.value })}
                placeholder="https://github.com/username/repo"
              />
              <p className="text-sm text-muted-foreground">
                将显示在登录页面底部，用于项目展示或源码分享
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* 底部设置 */}
        <Card>
          <CardHeader>
            <CardTitle>底部设置</CardTitle>
            <CardDescription>配置页面底部信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-footer">底部信息</Label>
                <p className="text-sm text-muted-foreground">
                  启用后将在页面底部显示版权信息和友情链接
                </p>
              </div>
              <Switch
                id="show-footer"
                checked={settings.showFooter}
                onCheckedChange={(checked) => setSettings({ ...settings, showFooter: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="show-admin-link">管理后台链接</Label>
                <p className="text-sm text-muted-foreground">
                  在底部添加管理后台入口，方便管理员快速登录
                </p>
              </div>
              <Switch
                id="show-admin-link"
                checked={settings.showAdminLink}
                onCheckedChange={(checked) => setSettings({ ...settings, showAdminLink: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-copyright">版权信息</Label>
              <Textarea
                id="footer-copyright"
                value={settings.footerCopyright}
                onChange={(e) => setSettings({ ...settings, footerCopyright: e.target.value })}
                rows={2}
                placeholder="© 2026 公司名称. All rights reserved."
              />
              <p className="text-sm text-muted-foreground">
                显示在页面底部的版权声明，支持 HTML 标签
              </p>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-icp">备案信息</Label>
                  <p className="text-sm text-muted-foreground">
                    在页面底部显示 ICP 备案号，符合中国大陆网站法规要求
                  </p>
                </div>
                <Switch
                  id="show-icp"
                  checked={settings.showIcp}
                  onCheckedChange={(checked) => setSettings({ ...settings, showIcp: checked })}
                />
              </div>
              {settings.showIcp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="icp-number">ICP 备案号</Label>
                    <Input
                      id="icp-number"
                      value={settings.icpNumber || ""}
                      onChange={(e) => setSettings({ ...settings, icpNumber: e.target.value })}
                      placeholder="例如：京ICP备12345678号-1"
                    />
                    <p className="text-sm text-muted-foreground">
                      请填写您的网站备案号，可在工信部备案系统查询
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="icp-link">ICP 备案链接（可选）</Label>
                    <Input
                      id="icp-link"
                      value={settings.icpLink || ""}
                      onChange={(e) => setSettings({ ...settings, icpLink: e.target.value })}
                      placeholder="https://beian.miit.gov.cn"
                    />
                    <p className="text-sm text-muted-foreground">
                      填写后备案号将显示为可点击的链接，跳转到工信部备案查询页面
                    </p>
                  </div>
                </>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>友情链接</Label>
                  <p className="text-sm text-muted-foreground">
                    添加合作伙伴或常用网站链接
                  </p>
                </div>
                <Button onClick={addFooterLink} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  添加链接
                </Button>
              </div>
              {settings.footerLinks.map((link, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="链接名称"
                    value={link.name}
                    onChange={(e) => updateFooterLink(index, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="链接地址"
                    value={link.url}
                    onChange={(e) => updateFooterLink(index, "url", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeFooterLink(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* 功能设置 */}
        <Card>
          <CardHeader>
            <CardTitle>功能设置</CardTitle>
            <CardDescription>启用或禁用系统功能</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable-tracking">启用访问统计</Label>
                <p className="text-sm text-muted-foreground">
                  记录网站访问次数，用于数据统计
                </p>
              </div>
              <Switch
                id="enable-tracking"
                checked={settings.enableVisitTracking}
                onCheckedChange={(checked) => setSettings({ ...settings, enableVisitTracking: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存设置
          </Button>
        </div>
      </div>
    </div>
  )
}
