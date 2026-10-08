import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orquestra Fit",
    short_name: "Orquestra Fit",
    id: "/",
    description: "Gestão, treinos e evolução para academias.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: "#050606",
    theme_color: "#08090a",
    categories: ["fitness", "health"],
    icons: [
      {
        src: "/branding/orquestra-cs/app-icon-original-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/branding/orquestra-cs/app-icon-original-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/branding/orquestra-cs/app-icon-original-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/branding/orquestra-cs/app-icon-original-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
