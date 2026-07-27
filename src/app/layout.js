import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
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
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s=localStorage.getItem("zhixueban-font-size")||"standard";document.documentElement.className+=" font-"+s;})()` }} />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <NavBar />

        {/* 页面内容 */}
        <main className="max-w-6xl mx-auto px-4 py-8 w-full flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
