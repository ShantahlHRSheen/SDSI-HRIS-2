import type { MetadataRoute } from "next";

// Makes the HRIS installable as an app (Chrome / Edge "Install", Android
// "Install app", iPhone "Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shantahl HRIS",
    short_name: "Shantahl HRIS",
    description: "Shantahl Direct Sales Inc. Human Resource Information System",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#013825",
    theme_color: "#013825",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
