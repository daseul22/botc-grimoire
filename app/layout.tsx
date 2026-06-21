import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteNav } from "@/components/SiteNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BotC 그리모어 — 시계탑에 흐른 피",
  description: "시계탑에 흐른 피(Blood on the Clocktower) 직업 · 시트 · 규칙 레퍼런스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
            <div className="mx-auto max-w-[88rem] px-4 h-14 flex items-center gap-2">
              <Link href="/" className="shrink-0 font-bold text-gold tracking-tight">
                BotC 그리모어
              </Link>
              <SiteNav />
            </div>
          </header>
          <main className="flex-1 mx-auto w-full max-w-[88rem] px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-border text-muted text-xs">
            <div className="mx-auto max-w-[88rem] px-4 py-4">
              시계탑에 흐른 피(Blood on the Clocktower)는 The Pandemonium Institute의
              저작물입니다. 본 사이트는 개인 · 로컬 모임용 팬 도구입니다.
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
