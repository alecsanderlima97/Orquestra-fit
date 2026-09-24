import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orquestra Fit",
    short_name: "Orquestra Fit",
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
        src: "/branding/orquestra-assistant-icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
