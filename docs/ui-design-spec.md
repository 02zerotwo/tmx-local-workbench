# UI 设计规范 · 极简黑白（Monochrome）

> TMX Forge 前端设计系统。目标：克制、专业、高信息密度的生产力工具质感（参考 Linear / GitHub / VS Code）。
> 本规范是**单一事实来源**——所有颜色、圆角、间距、字号、控件尺寸只能来自这里定义的令牌与组件变体。

## 0. 核心原则

1. **纯黑白灰阶**。UI 不使用任何彩色（蓝/绿/黄/紫…）。层级只靠明度、边框、字重、留白表达。
2. **唯一例外——危险红**。仅"删除 / 破坏性操作 / 错误状态"可使用 `destructive`（红）。其余一律灰阶。
3. **令牌优先**。业务组件禁止出现 `slate-* / blue-* / emerald-* / amber-* / red-*` 等原始调色板类名；一律用语义令牌（`bg-background`、`text-muted-foreground`、`border-border`…）。
4. **组件优先**。禁止内联重写按钮/输入框样式；用 `<Button variant size>`、`<Input>` 等组件的变体。焦点态由 `--ring` 统一。
5. **跟随系统 + 可切换**。默认跟随操作系统明暗，右上角提供手动切换，明暗两套都要打磨到位。

## 1. 颜色令牌

以 HSL 三元组存于 `src/app/globals.css`，通过 `hsl(var(--token))` 使用。明暗两套。

| 令牌 | 亮色 (L) | 暗色 (D) | 用途 |
|---|---|---|---|
| `--background` | `0 0% 100%` | `0 0% 7%` | 页面主背景 |
| `--foreground` | `0 0% 9%` | `0 0% 95%` | 主文字 |
| `--card` / `-foreground` | `0 0% 100%` / `0 0% 9%` | `0 0% 9%` / `0 0% 95%` | 卡片/面板/顶栏表面 |
| `--popover` / `-foreground` | `0 0% 100%` / `0 0% 9%` | `0 0% 9%` / `0 0% 95%` | 弹层 |
| `--primary` / `-foreground` | `0 0% 9%` / `0 0% 98%` | `0 0% 95%` / `0 0% 9%` | 主行动（实心黑/白按钮） |
| `--secondary` / `-foreground` | `0 0% 96%` / `0 0% 9%` | `0 0% 15%` / `0 0% 95%` | 次级中性面 |
| `--muted` / `-foreground` | `0 0% 96%` / `0 0% 45%` | `0 0% 15%` / `0 0% 62%` | 弱背景 / 次要文字 |
| `--accent` / `-foreground` | `0 0% 94%` / `0 0% 9%` | `0 0% 18%` / `0 0% 95%` | hover / 选中态中性背景 |
| `--border` | `0 0% 90%` | `0 0% 18%` | 分隔线、描边 |
| `--input` | `0 0% 90%` | `0 0% 22%` | 输入框描边 |
| `--ring` | `0 0% 9%` | `0 0% 83%` | 聚焦环（组件用 `ring/50` 柔化） |
| `--destructive` / `-foreground` | `0 72% 51%` / `0 0% 98%` | `0 62% 52%` / `0 0% 98%` | **唯一彩色**：删除/错误 |

**语义映射（迁移时的替换规则）**

| 旧的硬编码 | 语义角色 | 新令牌类 |
|---|---|---|
| `slate-50` / `bg-white`（表面） | 表面 | `bg-card` 或 `bg-background` |
| `slate-100`（弱背景） | 弱背景 | `bg-muted` |
| `slate-200/300`（边框） | 边框 | `border-border`（输入框 `border-input`） |
| `slate-900/950`（标题） | 主文字 | `text-foreground` |
| `slate-700/800`（正文） | 正文 | `text-foreground`（次强 `text-foreground/80`） |
| `slate-500/600`（次要） | 次要文字 | `text-muted-foreground` |
| `slate-400`（装饰图标/占位） | 弱化 | `text-muted-foreground/70` |
| `blue-700` 实心品牌块 | 品牌/主行动 | `bg-primary text-primary-foreground` |
| `blue-*` ghost hover / 链接 | 主行动/链接 | `text-foreground` + `hover:bg-accent`；链接 `text-primary` |
| `blue-600/100` 输入聚焦环 | 聚焦 | 删除，交给组件 `focus-visible:ring-ring/50` |
| `emerald-*`（成功） | 成功 | 灰阶：`text-foreground` + ✓ 图标（不使用绿色） |
| `amber-*`（已修改/暂停/警告） | 状态 | 灰阶徽标（见 §7）；不使用黄色 |
| `red-*`（错误/删除） | 危险 | `text-destructive` / `bg-destructive/10` / `variant="destructive"` |
| diff：绿=新增、红=删除 | 差异 | 删除保留红+删除线；新增用 `bg-foreground/10 underline`（灰阶） |

## 2. 圆角

`--radius: 0.375rem`（6px）为基准；轻微圆角风格（4–6px）。

| Tailwind 类 | 值 | 用途 |
|---|---|---|
| `rounded-sm` | 2px | 小徽标、highlight mark |
| `rounded-md` | 4px | 密集小控件 |
| `rounded-lg`（= `--radius`） | 6px | 按钮、输入框、选择器（默认） |
| `rounded-xl` | 10px | 卡片、面板、对话框 |
| `rounded-full` | 圆形 | 头像、圆点、图标按钮可选 |

额外定义 `--radius-md: 0.3125rem`（组件内部 `min(var(--radius-md),10px)` 引用需要）。

## 3. 阴影 / 层级

黑白极简**忌重投影**，层级优先用 `border` + 明度分层。

| 类 | 用途 |
|---|---|
| 无阴影 + `border` | 卡片、面板默认分层 |
| `shadow-sm` | 选中行、轻微悬浮 |
| `shadow-md` | 弹层（Popover / Dropdown / Toast / Dialog） |
| ~~`shadow-soft`（大投影）~~ | 移除 |

## 4. 排版

字体 `Inter` + 中文 fallback（`"PingFang SC","Microsoft YaHei"`）。字重仅 `normal / medium / semibold`。

| 角色 | 类 | 用途 |
|---|---|---|
| 页面标题 | `text-base font-semibold` | 顶栏项目名 |
| 分区标题 | `text-sm font-semibold` | 面板/分组标题 |
| 正文 | `text-sm` | 列表、表单主体 |
| 次要 | `text-xs text-muted-foreground` | 文件名、统计、辅助 |
| 徽标/计数 | `text-xs font-medium` | Badge |
| 编辑区（原文/译文） | `text-[15px] leading-relaxed` | 核心翻译场景，提升可读性 |

禁止随意 `text-[11px]` / `text-[0.8rem]`：密集处统一 `text-xs`（12px）。

## 5. 间距与尺寸（4px 网格）

**控件高度只允许这几档**（对应 `Button` 的 size 变体，一整排控件必须同高）：

| 场景 | 高度 | 变体 |
|---|---|---|
| 密集图标按钮 | 28px | `size="icon-sm"` |
| 工具栏主控件（搜索/选择/主按钮/输入框） | **32px** `h-8` | `size="default"` |
| 强调主行动（保存等） | 36px `h-9` | `size="lg"` |
| 表格行高 | 44px | — |
| 顶栏 | 52–56px | — |

内边距：面板内容 `p-3`~`p-4`；工具栏 `px-3 py-2`；卡片 `p-4`；分组头 `px-3`。
控件横向间距 `gap-2`（密集）/`gap-4`（松）。图标+文字按钮内 `gap-1.5`。

## 6. 按钮

沿用 `src/components/ui/button.tsx` 的变体系统，**业务层只允许用变体，禁止内联覆盖颜色/高度/圆角**。

**变体语义（固定用途）**

| variant | 外观 | 用途 | 每屏建议 |
|---|---|---|---|
| `default` | 实心（黑底白字 / 暗色下白底黑字） | 页面唯一主行动 | 每主区域 ≤1 |
| `outline` | 描边 + 透明底 | 并列的次要行动 | 多个 |
| `ghost` | 透明，hover `bg-accent` | 图标按钮、工具栏动作、返回 | 多个 |
| `secondary` | 浅灰实心 | 中性次级 | 少量 |
| `destructive` | 红色系（`bg-destructive/10 text-destructive`） | 删除/破坏性 | 按需 |
| `link` | 文字下划线 | 纯跳转 | 极少 |

**尺寸**：`xs`(24) / `sm`(28) / `default`(32) / `lg`(36) / `icon`(32) / `icon-sm`(28) / `icon-xs`(24)。

**交互 / hover / 状态规范**

| 状态 | 规则 |
|---|---|
| hover | `default`: `hover:bg-primary/90`（加深，非变浅）；`ghost`/`outline`: `hover:bg-accent hover:text-accent-foreground` |
| active | 全局 `active:translate-y-px`（按下微沉，已在基类） |
| focus-visible | 统一 `ring-3 ring-ring/50` + `border-ring`（键盘可达，禁止硬编码 `ring-blue-*`） |
| disabled | `opacity-50 pointer-events-none`（基类） |
| loading | 用 `Loader2 animate-spin` 替换前置图标，`disabled` 期间保持宽度 |

**硬性规则**
- 图标按钮必须 `size="icon"|"icon-sm"` + `aria-label` + `title`，不得手写 `size-9 inline-flex …`。
- 按钮内 lucide 图标**不传 `size`**，由基类 `[&_svg]:size-4`（16px）统一；`sm`/`xs` 自动降到 14/12。
- 一排里实心主按钮只能 1 个，其余 `outline`/`ghost`。
- "验证/刷新"等非破坏动作**禁止**用 `destructive` 变体。

## 7. 状态徽标（Badge）

翻译状态与任务状态一律**灰阶**，用「实心 / 描边 / 圆点 / 字重」区分，唯错误用红：

| 状态 | 表达 |
|---|---|
| 已修改 / changed | `variant="secondary"`（浅灰实心徽标） |
| 空译文 / empty | `variant="outline"`（描边徽标）+ 前置小圆点 `bg-muted-foreground` |
| 就绪 / ready / complete | `variant="outline"` + ✓ 图标（灰） |
| 进行中 / running / importing | `variant="secondary"` + `Loader2 animate-spin` |
| 暂停 / paused / queued | `variant="outline"` `text-muted-foreground` |
| 失败 / error / partial_failure | `variant="destructive"`（红，唯一彩色） |

> 修复：`translation-table.tsx` 原 `bg-amber-50 text-amber-100`（浅底浅字隐形）→ 改为灰阶 secondary 徽标。

## 8. 图标

- 库统一 **lucide-react**，`strokeWidth={1.75}`（比默认 2 更精致）。
- **尺寸只用两档**：`16`（默认，随文字/按钮，交给组件基类）、`14`（密集处）。徽标内 `12`。空状态大图标 `28–32`。品牌标记图标 `18`。
- **禁止**再出现 `13/15/17/19/24/34/36` 等杂尺寸。
- 图标颜色 `currentColor`，跟随文字；仅错误图标可 `text-destructive`。

## 9. 布局

三段式 + 双栏，规范化：

```
Header  h-14  bg-card border-b            返回 · 品牌 · 项目名/文件名 · 统计 · 导出 · 主题切换
Toolbar px-3 py-2  bg-background border-b  搜索 · 语言 · 状态切换 · 重复项（全部 h-8 同高）
┌───────────────┬───────────────────────┐
│ 翻译列表        │  详情/编辑 + AI（Tabs） │
│ list + 分页    │                        │
└───────────────┴───────────────────────┘
```

- 表面层级：顶栏/卡片 `bg-card`，主体 `bg-background`，分组头 `bg-muted/40`，靠 `border-border` 分隔而非阴影。
- 顶栏统计（翻译行/已修改/空译文）→ 灰阶 `text-muted-foreground` + `text-foreground` 强调数字（不用琥珀/红）。
- 空状态统一用 `ui/empty.tsx` 组件（图标 + 主副文案），不用一行居中灰字。
- 所有 padding 走 4px 网格；面板内统一 `p-3`。

## 10. 主题基建

- Tailwind v3：`tailwind.config.ts` 设 `darkMode: "class"`。
- `next-themes`：`ThemeProvider attribute="class" defaultTheme="system" enableSystem`，包裹于 `layout.tsx`；`<html>` 加 `suppressHydrationWarning`。
- 提供 `ThemeToggle` 组件（明/暗/系统），置于顶栏右侧。
- `globals.css`：`:root`（亮）+ `.dark`（暗）两套令牌；`color-scheme` 随主题；补齐 `--radius-md`、`--color-background`/`--color-muted-foreground`（供 `shimmer.tsx`）。
- `tailwind.config.ts`：新增 `card` 令牌，删除一次性 `ink`/`panel`/`line`，移除大投影 `soft`（或改小）。
