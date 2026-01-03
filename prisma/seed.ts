import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// 基础分类（少量）
const basicCategories = [
  { name: '常用工具', slug: 'tools', order: 1 },
  { name: '开发资源', slug: 'dev', order: 2 },
  { name: '设计灵感', slug: 'design', order: 3 },
  { name: '学习社区', slug: 'community', order: 4 },
]

// 完整分类（大量）
const fullCategories = [
  { name: '常用工具', slug: 'tools', order: 1 },
  { name: '开发工具', slug: 'dev', order: 2 },
  { name: '设计资源', slug: 'design', order: 3 },
  { name: '学习资源', slug: 'learning', order: 4 },
  { name: 'AI 工具', slug: 'ai', order: 5 },
  { name: '云服务', slug: 'cloud', order: 6 },
  { name: '社区论坛', slug: 'community', order: 7 },
  { name: '文档参考', slug: 'docs', order: 8 },
  { name: '生产力', slug: 'productivity', order: 9 },
  { name: '娱乐休闲', slug: 'entertainment', order: 10 },
]

// 基础网站（少量示例）
const basicSites = [
  {
    name: 'Google',
    url: 'https://www.google.com',
    description: '全球最大的搜索引擎',
    categorySlug: 'tools',
  },
  {
    name: 'GitHub',
    url: 'https://github.com',
    description: '全球最大的代码托管平台',
    categorySlug: 'dev',
  },
  {
    name: 'Stack Overflow',
    url: 'https://stackoverflow.com',
    description: '程序员问答社区',
    categorySlug: 'dev',
  },
  {
    name: 'Figma',
    url: 'https://www.figma.com',
    description: '在线协作设计工具',
    categorySlug: 'design',
  },
]

// 完整网站（大量示例）
const fullSites = [
  // 常用工具
  { name: 'Google', url: 'https://www.google.com', description: '全球最大的搜索引擎', categorySlug: 'tools' },
  { name: 'GitHub', url: 'https://github.com', description: '全球最大的代码托管平台', categorySlug: 'tools' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com', description: '程序员问答社区', categorySlug: 'tools' },
  { name: 'ChatGPT', url: 'https://chat.openai.com', description: 'OpenAI 的 AI 聊天机器人', categorySlug: 'tools' },
  { name: 'Notion', url: 'https://www.notion.so', description: '一体化工作空间', categorySlug: 'tools' },

  // 开发工具
  { name: 'VS Code', url: 'https://code.visualstudio.com', description: '强大的代码编辑器', categorySlug: 'dev' },
  { name: 'Vercel', url: 'https://vercel.com', description: 'Next.js 开发团队推出的部署平台', categorySlug: 'dev' },
  { name: 'React', url: 'https://react.dev', description: 'React 官方文档', categorySlug: 'dev' },
  { name: 'Next.js', url: 'https://nextjs.org', description: 'React 全栈框架', categorySlug: 'dev' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com', description: '实用优先的 CSS 框架', categorySlug: 'dev' },

  // 设计资源
  { name: 'Dribbble', url: 'https://dribbble.com', description: '设计师作品分享社区', categorySlug: 'design' },
  { name: 'Behance', url: 'https://www.behance.net', description: 'Adobe 创意作品展示平台', categorySlug: 'design' },
  { name: 'Figma', url: 'https://www.figma.com', description: '在线协作设计工具', categorySlug: 'design' },
  { name: 'shadcn/ui', url: 'https://ui.shadcn.com', description: '精美的 React 组件库', categorySlug: 'design' },
  { name: 'Unsplash', url: 'https://unsplash.com', description: '免费高质量图片资源', categorySlug: 'design' },

  // 学习资源
  { name: 'MDN Web Docs', url: 'https://developer.mozilla.org', description: 'Web 开发权威文档', categorySlug: 'learning' },
  { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org', description: '免费编程学习平台', categorySlug: 'learning' },
  { name: 'LeetCode', url: 'https://leetcode.cn', description: '算法刷题平台', categorySlug: 'learning' },
  { name: 'Coursera', url: 'https://www.coursera.org', description: '在线课程学习平台', categorySlug: 'learning' },
  { name: 'YouTube', url: 'https://www.youtube.com', description: '全球最大的视频分享平台', categorySlug: 'learning' },

  // AI 工具
  { name: 'Claude', url: 'https://claude.ai', description: 'Anthropic 推出的 AI 助手', categorySlug: 'ai' },
  { name: 'Midjourney', url: 'https://www.midjourney.com', description: 'AI 图像生成工具', categorySlug: 'ai' },
  { name: 'Hugging Face', url: 'https://huggingface.co', description: 'AI 模型社区', categorySlug: 'ai' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai', description: 'AI 搜索引擎', categorySlug: 'ai' },
  { name: 'Runway', url: 'https://runwayml.com', description: 'AI 视频编辑工具', categorySlug: 'ai' },

  // 云服务
  { name: 'AWS', url: 'https://aws.amazon.com', description: '亚马逊云服务平台', categorySlug: 'cloud' },
  { name: 'Vercel', url: 'https://vercel.com', description: '前端应用部署平台', categorySlug: 'cloud' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com', description: 'CDN 和网络安全服务', categorySlug: 'cloud' },
  { name: 'Railway', url: 'https://railway.app', description: '简单易用的云平台', categorySlug: 'cloud' },
  { name: 'Netlify', url: 'https://www.netlify.com', description: '现代化的部署平台', categorySlug: 'cloud' },

  // 社区论坛
  { name: 'Twitter', url: 'https://twitter.com', description: '实时社交网络平台', categorySlug: 'community' },
  { name: 'Reddit', url: 'https://www.reddit.com', description: '社交新闻聚合网站', categorySlug: 'community' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', description: '计算机新闻社区', categorySlug: 'community' },
  { name: 'Product Hunt', url: 'https://www.producthunt.com', description: '产品发现社区', categorySlug: 'community' },
  { name: 'Indie Hackers', url: 'https://www.indiehackers.com', description: '独立开发者社区', categorySlug: 'community' },

  // 文档参考
  { name: 'Can I Use', url: 'https://caniuse.com', description: '浏览器兼容性查询', categorySlug: 'docs' },
  { name: 'DevDocs', url: 'https://devdocs.io', description: '多语言文档集合', categorySlug: 'docs' },
  { name: 'CSS-Tricks', url: 'https://css-tricks.com', description: 'CSS 技巧和教程', categorySlug: 'docs' },
  { name: 'RegExp101', url: 'https://regex101.com', description: '正则表达式在线测试', categorySlug: 'docs' },
  { name: 'JSON Editor', url: 'https://jsoneditoronline.org', description: 'JSON 在线编辑器', categorySlug: 'docs' },

  // 生产力
  { name: 'Trello', url: 'https://trello.com', description: '项目管理工具', categorySlug: 'productivity' },
  { name: 'Slack', url: 'https://slack.com', description: '团队协作工具', categorySlug: 'productivity' },
  { name: 'Miro', url: 'https://miro.com', description: '在线白板协作工具', categorySlug: 'productivity' },
  { name: 'Zoom', url: 'https://zoom.us', description: '视频会议工具', categorySlug: 'productivity' },
  { name: 'Discord', url: 'https://discord.com', description: '游戏社区和语音聊天', categorySlug: 'productivity' },

  // 娱乐休闲
  { name: 'Netflix', url: 'https://www.netflix.com', description: '流媒体视频服务', categorySlug: 'entertainment' },
  { name: 'Spotify', url: 'https://www.spotify.com', description: '音乐流媒体服务', categorySlug: 'entertainment' },
  { name: 'Twitch', url: 'https://www.twitch.tv', description: '游戏直播平台', categorySlug: 'entertainment' },
  { name: 'Bilibili', url: 'https://www.bilibili.com', description: '国内知名视频弹幕网站', categorySlug: 'entertainment' },
]

async function main() {
  const args = process.argv.slice(2)
  const mode = args[0] || 'basic'

  console.log('\n🌱 开始填充种子数据...\n')

  // 检查是否已初始化
  const userCount = await prisma.user.count()
  const settingsExists = await prisma.systemSettings.count()
  const categoryCount = await prisma.category.count()

  const isInitialized = userCount > 0 || settingsExists > 0 || categoryCount > 0

  if (isInitialized && mode === 'init') {
    console.log('✅ 数据库已经初始化，跳过基础数据填充')
    console.log(`   - 用户: ${userCount}`)
    console.log(`   - 系统设置: ${settingsExists}`)
    console.log(`   - 分类: ${categoryCount}\n`)

    // 仅确保默认管理员存在
    if (userCount === 0) {
      console.log('⚠️  未检测到管理员用户，创建默认管理员...')
      await createDefaultAdmin()
    }

    return
  }

  // 1. 创建默认管理员用户
  if (userCount === 0) {
    await createDefaultAdmin()
  } else {
    console.log('✅ 管理员用户已存在，跳过\n')
  }

  // 2. 创建系统设置
  if (settingsExists === 0) {
    console.log('⚙️  创建系统设置...')
    await prisma.systemSettings.create({
      data: {
        id: 'default',
        siteName: 'Conan Nav',
        siteDescription: '简洁现代化的网址导航系统',
        pageSize: 20,
        showFooter: true,
        footerCopyright: `© ${new Date().getFullYear()} Conan Nav. All rights reserved.`,
        footerLinks: [
          { name: 'GitHub', url: 'https://github.com/01wanwu/nav' }
        ],
        showAdminLink: true,
        enableVisitTracking: true,
        githubUrl: 'https://github.com/01wanwu/nav',
      },
    })
    console.log('  ✓ 系统设置已初始化')
    console.log('  ✓ 友情链接: GitHub\n')
  } else {
    console.log('✅ 系统设置已存在，跳过\n')
  }

  // 3. 根据模式选择数据
  const categories = mode === 'full' ? fullCategories : basicCategories
  const sites = mode === 'full' ? fullSites : basicSites

  // 4. 创建分类
  console.log(`📁 创建分类 (${mode === 'full' ? '完整模式' : '基础模式'})...`)
  const createdCategories = []

  for (const category of categories) {
    const existing = await prisma.category.findUnique({
      where: { slug: category.slug },
    })

    if (!existing) {
      const created = await prisma.category.create({
        data: category,
      })
      createdCategories.push(created)
      console.log(`  ✓ 创建分类: ${created.name}`)
    } else {
      createdCategories.push(existing)
      console.log(`  - 分类已存在: ${existing.name}`)
    }
  }

  console.log(`\n📂 分类总数: ${createdCategories.length}\n`)

  // 5. 创建网站
  console.log('🔗 创建网站...')
  let createdCount = 0
  let skippedCount = 0

  for (const site of sites) {
    const category = createdCategories.find((c) => c.slug === site.categorySlug)
    if (!category) {
      console.log(`  ✗ 未找到分类: ${site.categorySlug}`)
      continue
    }

    const existing = await prisma.site.findFirst({
      where: { url: site.url },
    })

    if (!existing) {
      await prisma.site.create({
        data: {
          name: site.name,
          url: site.url,
          description: site.description,
          categoryId: category.id,
          isPublished: true,
        },
      })
      createdCount++
      if (createdCount % 10 === 0 && mode === 'full') {
        console.log(`  进度: 已创建 ${createdCount} 个网站...`)
      }
    } else {
      skippedCount++
    }
  }

  console.log(`\n✅ 种子数据填充完成！`)
  console.log(`   - 模式: ${mode === 'full' ? '完整模式 (50+ 网站)' : '基础模式 (4 个示例网站)'}`)
  console.log(`   - 分类: ${createdCategories.length} 个`)
  console.log(`   - 新增网站: ${createdCount} 个`)
  console.log(`   - 已存在网站: ${skippedCount} 个\n`)

  console.log('💡 提示：')
  console.log('   - 管理员账号: admin@example.com')
  console.log('   - 管理员密码: admin123')
  console.log('   - 后台地址: /admin')
  if (mode === 'basic') {
    console.log('   - 如需更多示例数据，运行: npm run db:seed:full\n')
  }
}

async function createDefaultAdmin() {
  console.log('👤 创建管理员用户...')
  const hashedPassword = await bcrypt.hash('admin123', 10)
  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: '管理员',
      avatar: null, // 默认无头像，用户可在后台设置
      role: 'ADMIN',
    },
  })
  console.log('  ✓ 创建管理员: admin@example.com (密码: admin123)\n')
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
