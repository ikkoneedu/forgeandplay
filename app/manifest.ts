import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Forge&Play",
    description: "AI destekli oyun arkadaşı platformu + anında oynanan oyunlar.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060d",
    theme_color: "#05060d",
    icons: [],
  };
}
