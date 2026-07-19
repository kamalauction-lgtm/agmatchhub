import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IQI AG MatchHub",
    short_name: "MatchHub",
    description:
      "One Requirement. Multiple Opportunities. Controlled Collaboration.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#141416",
    theme_color: "#B11226",
    icons: [
      { src: "/brand/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/pwa-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
