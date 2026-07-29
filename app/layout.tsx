import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "powerUp | 今日のコンディション",
  description: "睡眠・食事・スマートフォン・成果から、自分の生産性が上がる条件を見つけるダッシュボード",
};

export const viewport: Viewport = {
  themeColor: "#111A3A",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
