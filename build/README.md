# TMX 本地翻译工作台 Windows 版

## 打开方式

1. 下载 `TMX-Local-Workbench-windows-x64` 构建产物。
2. 完整解压 ZIP，不要只复制其中的 EXE 文件。
3. 双击 `TMX-Workbench.exe`。
4. 首次打开后，点击“导入 TMX”创建项目。

应用为便携版，不需要安装 Node.js、SQLite、Office 或其他运行环境。Excel 导出文件可使用 Microsoft Excel、WPS Office 或 LibreOffice 打开。

## 数据位置

- 正常情况下，数据库保存在程序目录旁的 `data/tmx-workbench.db`。
- 如果程序所在目录不可写，应用会改用当前 Windows 用户的应用数据目录。
- 点击项目库右上角的文件夹按钮，可以直接打开实际数据目录。
- 移动程序前，建议先点击“备份”生成一个独立的 `.db` 备份文件。

## 备份与恢复

- “备份”会保存全部项目、翻译内容和编辑记录。
- “恢复”只接受本应用生成且结构有效的数据库文件。
- 恢复前，应用会在数据目录自动保留一份 `pre-restore` 安全副本。

## Windows 安全提示

当前构建未进行商业代码签名。Windows 可能显示“Windows 已保护你的电脑”。确认压缩包来自可信来源后，可点击“更多信息”，再点击“仍要运行”。

## 构建说明

Windows x64 成品必须在 Windows 环境构建，因为项目使用了 SQLite 原生模块。仓库中的 `Build Windows portable ZIP` 工作流会运行测试、代码检查和打包，并上传 ZIP 构建产物。
