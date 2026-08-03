import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR NEXT 技能广场",
  description: "HR NEXT 社群的技能共享与许愿共创",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="top">
          <div className="wrap">
            <strong>
              <Link href="/">HR NEXT 技能广场</Link>
            </strong>
            <nav>
              <Link href="/skills">技能目录</Link>
              <Link href="/wishes">许愿池</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
