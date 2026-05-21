import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import { Header } from "@portal/components/Header";
import { Footer } from "@portal/components/Footer";
import { ErrorReporterMount } from "@portal/components/ErrorReporterMount";

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const heading = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Golmuri Janch Ghar — Patient Portal",
  description:
    "View your lab reports, pay invoices, and book home sample collection at Golmuri Janch Ghar diagnostic lab, Jamshedpur.",
};

// Inline script: read stored or system preference BEFORE React hydrates so
// there is no flash of the wrong theme.
const themeBootstrap = `
(function(){try{
  var t = localStorage.getItem('gjg-theme');
  if(!t){ t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.dataset.theme = t;
}catch(e){ document.documentElement.dataset.theme = 'light'; }})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${body.variable} ${heading.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <ErrorReporterMount />
        <Header />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
