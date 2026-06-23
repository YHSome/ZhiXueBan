import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "智学伴 - 基于生成式 AI 的异步学习方案",
  description: "突破时空限制，AI 驱动的个性化异步学习平台",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        {/* 顶部导航栏 */}
        <header className="bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">📚 智学伴</h1>
            <nav className="space-x-4 text-sm flex items-center">
              <a href="/" className="text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                首页
              </a>
              <a href="/learn" className="text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                学习
              </a>
              <a href="/create" className="text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                创建课程
              </a>
              <a
                href="/setup"
                className="text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                ⚙️ 配置
              </a>
            </nav>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="max-w-6xl mx-auto px-4 py-8 w-full flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
