import type { MetadataRoute } from "next";
import { BAND_LIGHT } from "@portal/lib/theme";

/**
 * Patients arrive here once or twice per visit, usually from a link or a typed
 * address, on their own phone. The manifest is less about installability than
 * about the page having an identity at all: before this the portal shipped no
 * image of any kind, so a patient met the lab through a blank browser tab.
 *
 * `theme_color` reuses the same band teal the layout already sets, so the
 * status bar matches the header rather than sitting as a white strip above it.
 *
 * The icon is the lab's real logo, used as-is per the brand commitment. It is a
 * 1024×1024 JPEG despite its `.png` name in the desktop app, so it has no
 * transparency and is not declared `maskable`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golmuri Janch Ghar — Patient Portal",
    short_name: "Janch Ghar",
    description:
      "View your lab reports, pay invoices, and book home sample collection.",
    start_url: "/",
    display: "standalone",
    background_color: "#edf1f4",
    theme_color: BAND_LIGHT,
    icons: [
      {
        src: "/icon.jpg",
        sizes: "1024x1024",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
