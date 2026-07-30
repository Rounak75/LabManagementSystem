import "./globals.css";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Header } from "@portal/components/Header";
import { Footer } from "@portal/components/Footer";
import { ErrorReporterMount } from "@portal/components/ErrorReporterMount";

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const heading = Plus_Jakarta_Sans({
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

// The band runs to the top of the page, so the phone's status bar and browser
// chrome should be the same teal rather than a strip of white above it.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2A5F6F" },
    { media: "(prefers-color-scheme: dark)", color: "#102C35" },
  ],
};

// Theme defaults to the operating system and stays subscribed to it, so
// flipping the OS re-themes the open tab rather than waiting for a reload.
// An explicit choice from the toggle is stored and wins from then on — once
// someone has said what they want, the OS no longer gets to overrule them.
//
// Runs before React hydrates so the first paint is already the right one.
const themeBootstrap = `
(function(){try{
  var q = window.matchMedia('(prefers-color-scheme: dark)');
  var apply = function(){
    var chosen = localStorage.getItem('gjg-theme');
    document.documentElement.dataset.theme = chosen || (q.matches ? 'dark' : 'light');
  };
  apply();
  var follow = function(){ if(!localStorage.getItem('gjg-theme')) apply(); };
  if(q.addEventListener){ q.addEventListener('change', follow); }
  else if(q.addListener){ q.addListener(follow); }
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
      {/* Pages own their own horizontal rhythm: each opens with a full-bleed
          teal band and pulls its first card up into it, so `main` stays edge
          to edge and `Container` does the measuring. */}
      <body className="flex min-h-screen flex-col">
        <ErrorReporterMount />
        <Header />
        <main className="flex-1 w-full pb-14">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
