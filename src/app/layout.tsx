import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TMX Local Workbench",
  description: "本地解析、筛选、编辑并导出 TMX 翻译文件",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
