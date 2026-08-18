import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Lab Admin — Golmuri Janch Ghar",
  // This app shipped no image of any kind, so it had a blank tab and could not
  // be added to a phone home screen — on a surface that is phone-first and used
  // every shift.
  icons: { icon: "/icon.jpg", apple: "/icon.jpg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Lab Admin", statusBarStyle: "black-translucent" as const },
};

export const viewport = {
  // Matches the rail, so the phone's status bar continues the dark furniture
  // instead of sitting as a white strip above it.
  themeColor: "#2f3542",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
