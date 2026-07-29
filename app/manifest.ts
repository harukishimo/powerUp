import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "powerUp",
    short_name: "powerUp",
    description: "睡眠・食事・スマートフォン利用・成果を記録し、生産性が上がる条件を見つけるアプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F7F8FC",
    theme_color: "#111A3A",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
