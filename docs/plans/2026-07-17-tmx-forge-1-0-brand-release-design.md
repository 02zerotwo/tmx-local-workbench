# TMX Forge 1.0 品牌与发布设计

## 品牌

- 应用名称：`TMX Forge`
- npm 包名：`tmx-forge`
- 可执行文件名：`TMX-Forge`
- 打包目录与压缩包前缀：`TMX-Forge`
- 版本：`1.0.0`
- Git 标签：`v1.0.0`
- GitHub Release 标题：`TMX Forge v1.0.0`

## Logo

图标主体由两条文档折带交织成几何 `X`，右上角带 AI 四角星。主色为深蓝、靛蓝和紫色渐变，不包含文字。主图使用透明背景，并输出：

- `build/icon.png`：1024×1024 主图
- `build/icon.ico`：Windows 多尺寸图标
- `build/icon.icns`：macOS 图标集

图标应用到 Electron Packager，确保 Windows EXE、macOS App 和压缩包使用同一品牌。

## 名称替换范围

- `package.json` 的包名、产品名和版本
- Electron Packager 的应用名、可执行文件名、图标
- Next.js 页面标题
- 用户可见的构建说明和设计文档标题
- 发布产物目录与 ZIP 文件名

历史计划文档与旧 GitHub Release 保留原样，作为版本历史记录。

## 发布

在当前分支完成验证与双平台构建，提交品牌变更并推送当前分支。创建并推送 `v1.0.0` 标签，然后创建 GitHub Release，上传 Windows x64 ZIP 与 macOS arm64 ZIP，附带 SHA-256 校验值和 1.0 功能摘要。
