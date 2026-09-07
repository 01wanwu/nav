// 校验 messages/*.json 的结构一致性：
// 1. 每个语言文件必须包含与基准语言（zh）完全一致的键集合（不缺、不多）
// 2. 文案中的 {placeholder} 占位符必须与基准语言一致，否则运行时插值会错
// 3. 叶子节点值必须是字符串。允许空串：拆分句段式文案（如 admin.import.warningPart1）
//    在日语/韩语等语序不同的语言中前段合法为空
// 供 CI（.github/workflows/ci.yml）与本地 `npm run check:i18n` 使用
import { readFileSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"

const messagesDir = join(process.cwd(), "messages")
const baseLocale = "zh"

// 与 lib/i18n.ts 的 locales 保持同步的防呆校验：目录里的文件必须都是受支持语言
const supportedLocales = new Set(["zh", "en", "ja", "ko", "fr", "de"])

const files = readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => basename(f, ".json"))

const unknown = files.filter((l) => !supportedLocales.has(l))
if (unknown.length > 0) {
  console.error(
    `[i18n] messages/ 下存在未在脚本支持列表中的语言文件：${unknown.join(", ")}。` +
      `新增语言时请同步更新 lib/i18n.ts 的 locales 与本脚本。`
  )
  process.exit(1)
}

if (!files.includes(baseLocale)) {
  console.error(`[i18n] 缺少基准语言文件 messages/${baseLocale}.json`)
  process.exit(1)
}

const load = (locale) => JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"))

const flatten = (obj, prefix = "", out = {}) => {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === "object") {
      flatten(value, path, out)
    } else {
      out[path] = value
    }
  }
  return out
}

const placeholders = (text) =>
  typeof text === "string" ? [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []

const baseMessages = load(baseLocale)
const baseFlat = flatten(baseMessages)
const errors = []

for (const locale of files.filter((l) => l !== baseLocale)) {
  const flat = flatten(load(locale))

  const missing = Object.keys(baseFlat).filter((k) => !(k in flat))
  const extra = Object.keys(flat).filter((k) => !(k in baseFlat))

  if (missing.length > 0) {
    errors.push(`${locale}: 缺少 ${missing.length} 个键：\n  ${missing.join("\n  ")}`)
  }
  if (extra.length > 0) {
    errors.push(`${locale}: 多出 ${extra.length} 个键：\n  ${extra.join("\n  ")}`)
  }

  for (const [key, value] of Object.entries(flat)) {
    if (!(key in baseFlat)) continue
    if (typeof value !== "string") {
      errors.push(`${locale}: "${key}" 的值必须是字符串，实际为 ${JSON.stringify(value)}`)
      continue
    }
    const baseP = placeholders(baseFlat[key])
    const p = placeholders(value)
    if (baseP.join(",") !== p.join(",")) {
      errors.push(
        `${locale}: "${key}" 的占位符不一致，基准 {${baseP.join(", ")}}，实际 {${p.join(", ")}}`
      )
    }
  }
}

if (errors.length > 0) {
  console.error(`[i18n] 校验失败（基准语言：${baseLocale}）：\n\n${errors.join("\n\n")}`)
  process.exit(1)
}

console.log(
  `[i18n] 校验通过：${files.length} 个语言文件，基准 ${baseLocale} 共 ${Object.keys(baseFlat).length} 个键，结构与占位符一致。`
)
