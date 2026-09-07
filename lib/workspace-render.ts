import { cache } from "react"
import { getCurrentWorkspace } from "./workspace"
import { getDisplaySettings } from "./actions"

// 渲染路径专用的请求级缓存（React cache()）：根布局 metadata/body、public layout、
// 页面各自都会解析工作区与展示设置，一屏渲染重复查库 5 次。
// cache() 按「单次请求渲染」作用域记忆，Server Action 路径禁用——
// 那里的调用跨请求复用会读到过期的工作区上下文（见 lib/workspace.ts 的既有注释），
// 因此本模块只允许 layout/page 等 RSC 渲染调用点使用。

export const getCachedCurrentWorkspace = cache(getCurrentWorkspace)

export const getCachedDisplaySettings = cache(getDisplaySettings)
