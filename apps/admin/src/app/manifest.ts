import type { MetadataRoute } from "next";

/**
 * Staff use this on their own phones, twice a day, standing at the counter.
 * Without a manifest every shift started by finding a URL in a browser; with
 * one, "Add to Home screen" gives them an icon that opens straight into the
 * app with no browser chrome.
 *
 * `display: standalone` matters more here than it looks: the address bar and
 * tab strip are ~90px of a phone screen that this app spends on patient rows.
 *
 * The icon is the lab's real logo, used as-is per the brand commitment. Note it
 * is a 1024×1024 JPEG (the source file in the desktop app is named `.png` but
 * is JFIF-encoded), so it has no transparency and will show its own background
 * inside a rounded launcher mask. It is deliberately not declared `maskable`
 * for that reason — a maskable icon needs a verified safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lab Admin — Golmuri Janch Ghar",
    short_name: "Lab Admin",
    description:
      "Register patients, create visits, and enter results at the counter.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#2f3542",
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
