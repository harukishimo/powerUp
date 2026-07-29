import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "powerUp | 今日のコンディション",
  description: "睡眠・食事・スマートフォン・成果から、自分の生産性が上がる条件を見つけるダッシュボード",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
