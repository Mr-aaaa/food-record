# AGENTS.md — 每日营养（食物热量分析）项目结构索引

> 本文件是 Codex 的"项目地图"，每次会话自动加载，无需重复探索代码结构。
> 由 folder-structure-blueprint-generator skill 方法生成，请随项目演进保持更新。

## 1. 项目概览

- **名称**：每日营养 / `local-food-calorie-analysis` (v0.1.0)
- **定位**：本地优先（local-first）的食物热量与营养记录工具。数据仅存浏览器 IndexedDB，无账号、无云同步、无后端。
- **核心功能**：每日目标设置、实际/计划餐食记录、每日营养汇总、AI 餐食分析提示词生成、JSON 校验与餐食确认、餐食模板、体重/腰围追踪、完整备份与恢复。
- **技术栈**：
  - React 19.2 + react-dom
  - Vite 8（构建/开发服务器，端口 3000）
  - TypeScript 5.9（`type: module`）
  - Tailwind CSS 4（via `@tailwindcss/postcss`）
  - Vitest + @testing-library/react + jsdom + fake-indexeddb（测试）
  - ESLint 9
- **包管理**：pnpm（lockfile 为 `pnpm-lock.yaml`）；Node >=18（README 建议 >=22.13.0）

## 2. 目录结构

```
web/
├─ src/                     应用入口
│  ├─ main.tsx              React 挂载入口
│  ├─ App.tsx               根组件 / 顶层布局
│  └─ globals.css           全局样式（Tailwind 指令）
├─ components/              UI 组件（按工作区划分）
│  ├─ AppShell.tsx          应用外壳 / 导航
│  ├─ TodayDashboard.tsx    今日仪表盘
│  ├─ RecordWorkspace.tsx   餐食记录工作区
│  ├─ PlanWorkspace.tsx     计划餐食工作区
│  ├─ TrendsWorkspace.tsx   趋势工作区（体重/腰围）
│  ├─ SettingsWorkspace.tsx 设置工作区（目标等）
│  ├─ DataWorkspace.tsx     数据工作区（备份/恢复）
│  ├─ Onboarding.tsx        引导流程
│  └─ PieChart.tsx          饼图组件（营养占比）
├─ domain/                  领域逻辑（纯函数，无副作用，易测试）
│  ├─ types.ts              领域类型定义
│  ├─ nutrition.ts          营养素计算
│  ├─ energy.ts             热量计算
│  ├─ trends.ts             趋势计算
│  ├─ input-schema.ts       输入校验 schema
│  ├─ local-date.ts         本地日期处理
│  ├─ prompt.ts             AI 提示词生成
│  └─ workflows.ts          领域工作流编排
├─ state/
│  └─ app-store.tsx         全局状态（UI 与存储之间的桥接）
├─ db/
│  ├─ schema.ts             IndexedDB schema / store 定义
│  └─ index.ts              DB 初始化与连接
├─ storage/                 存储层（数据访问）
│  ├─ repository.ts         仓储：对外的数据访问 API
│  ├─ indexed-db.ts         IndexedDB 底层封装
│  ├─ backup.ts             备份导出 / 合并 / 替换恢复
│  └─ errors.ts             存储错误类型
├─ data/                    内置静态数据
│  ├─ foods.ts              内置食物库
│  └─ plans.ts              内置饮食方案
├─ tests/                   Vitest 测试（与源码同构命名）
├─ public/                  静态资源（favicon.svg 等）
├─ index.html               HTML 入口
├─ vite.config.ts           Vite 配置：alias @ -> 项目根, port 3000, outDir dist
├─ tsconfig.json            TypeScript 配置
├─ postcss.config.mjs       PostCSS / Tailwind 配置
├─ vitest.config.ts         测试配置
└─ package.json             依赖与脚本
```

## 3. 分层与数据流

```
UI (components/*)
  └─> 全局状态 (state/app-store.tsx)
        └─> 仓储 (storage/repository.ts)
              └─> IndexedDB 封装 (storage/indexed-db.ts + db/*)
                    └─> 浏览器 IndexedDB

领域逻辑 (domain/*) 为纯函数，被 UI / state 调用，不直接访问存储。
```

- **domain/**：纯领域计算与类型，无 I/O，是测试重点。
- **state/app-store.tsx**：集中管理 UI 状态，调用 repository 读写。
- **storage/repository.ts**：数据访问的门面，屏蔽 IndexedDB 细节。
- **storage/indexed-db.ts + db/**：底层 IndexedDB 操作。

## 4. 关键约定

- **导入别名**：`@` 指向 `web/` 根（见 `vite.config.ts`）。例：`import { foo } from "@/domain/types"`。
- **命名**：组件 PascalCase（`.tsx`）；领域/存储模块 kebab-case（`.ts`）；测试文件与被测模块同名置于 `tests/`。
- **测试**：Vitest，`tests/` 下与源文件对应；DB 相关测试用 `fake-indexeddb`。
- **样式**：Tailwind CSS 4，全局指令在 `src/globals.css`。
- **本地存储**：所有数据走 IndexedDB，无网络请求；备份为 JSON 文件下载。
- **动画库（统一）**：所有动画统一使用 [framer-motion](https://www.npmjs.com/package/framer-motion)（现名 `motion`，React 19 兼容）。**禁止引入 GSAP 或第二个动画体系**，避免两套动画库冲突与体积膨胀。
  - 时长规范：微交互/按钮反馈 150-300ms；弹窗、页面切换 300-500ms；超过 500ms 的 UI 动画视为反模式。
  - `ui-ux-pro-max` skill 的 16 个动效预设是 GSAP 格式，仅当作「时长/缓动/触发时机」的参数参考，实现一律转写为 framer-motion。
  - 必须支持 `prefers-reduced-motion`：用 `useReducedMotion()` 或 CSS `@media (prefers-reduced-motion: reduce)` 降级。


## 5. 开发命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发服务器 (http://localhost:3000)
pnpm build            # 生产构建 -> dist/
pnpm test -- --run    # 运行测试（单次）
pnpm test             # watch 模式
pnpm lint             # ESLint
```

## 6. 新增功能指南（文件放哪）

- **新 UI 组件** → `components/`，PascalCase `.tsx`。
- **新领域计算/类型** → `domain/`，纯函数 + 单测放 `tests/`。
- **新数据表/存储** → `db/schema.ts` 加 store 定义 + `storage/repository.ts` 加方法。
- **新静态数据** → `data/`。
- **新工作区/页面** → `components/` 加组件 + 在 `AppShell.tsx`/`App.tsx` 接入导航。
- **测试** → `tests/`，文件名与被测模块对应。

## 7. 修改功能时的快速定位

- 改餐食记录逻辑 → `components/RecordWorkspace.tsx` + `domain/workflows.ts`
- 改营养/热量计算 → `domain/nutrition.ts` + `domain/energy.ts`
- 改 AI 提示词 → `domain/prompt.ts`
- 改数据存储/读写 → `storage/repository.ts` + `storage/indexed-db.ts`
- 改数据库结构 → `db/schema.ts`
- 改备份/恢复 → `storage/backup.ts` + `components/DataWorkspace.tsx`
- 改趋势/体重 → `domain/trends.ts` + `components/TrendsWorkspace.tsx`
- 改目标/设置 → `components/SettingsWorkspace.tsx`
