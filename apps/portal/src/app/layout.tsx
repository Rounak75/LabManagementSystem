import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Header } from "@portal/components/Header";
import { Footer } from "@portal/components/Footer";
import { ErrorReporterMount } from "@portal/components/ErrorReporterMount";
import { BAND_DARK, BAND_LIGHT, THEME_STORAGE_KEY } from "@portal/lib/theme";

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Every weight here is a separate file a patient downloads over mobile data
// before the page settles, so the list is what is *used* and nothing else.
// 500 was in this list and appears nowhere in the portal — headings run 600,
// 700 (the `h1`–`h4` default) and 800.
const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["600", "700", "800"],
});

// 600 is the other side of that coin. Amounts, patient IDs and the phone
// number read back before a booking is submitted are all `font-mono
// font-semibold`, and with only 400 and 500 loaded the browser was faking the
// weight — synthetic bold smears a monospace face badly, worst of all on the
// ₹ figure at 22px that is the whole point of the payment screen.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Golmuri Janch Ghar — Patient Portal",
  description:
    "View your lab reports, pay invoices, and book home sample collection at Golmuri Janch Ghar diagnostic lab, Jamshedpur.",
  // Safari on iOS scans the page for things that look like phone numbers,
  // dates and addresses and turns them into blue links of its own. A patient
  // ID reads to it as a phone number, so `LAB-2026-00042` arrived underlined
  // in system blue, breaking out of the mono treatment the ID is given
  // everywhere else — and tapping it offered to dial. Everything here that is
  // genuinely callable is already an explicit `tel:` link, which this does not
  // affect; all the detector can add is false positives.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

// The band runs to the top of the page, so the phone's status bar and browser
// chrome should be the same teal rather than a strip of white above it.
//
// One value rather than a `prefers-color-scheme` pair — see `lib/theme`.
// `themeBootstrap` below owns it from first paint onward, on the same terms it
// owns `data-theme`. This is the server-rendered starting point, and it matches
// `data-theme="light"` on `<html>`.
export const viewport: Viewport = {
  themeColor: BAND_LIGHT,
};

// Theme defaults to the operating system and stays subscribed to it, so
// flipping the OS re-themes the open tab rather than waiting for a reload.
// An explicit choice from the toggle is stored and wins from then on — once
// someone has said what they want, the OS no longer gets to overrule them.
//
// Runs before React hydrates so the first paint is already the right one.
//
// `chrome` carries the same answer up into the browser's own UI. The meta tag
// it needs is emitted by Next's metadata rather than written here, and nothing
// guarantees it is in the document by the time this script runs — so a miss
// falls back to `DOMContentLoaded` rather than giving up. That fallback is
// only reachable in night mode: the server-rendered value is already the
// light-mode teal.
const themeBootstrap = `
(function(){try{
  var q = window.matchMedia('(prefers-color-scheme: dark)');
  var chrome = function(theme){
    var tags = document.querySelectorAll('meta[name="theme-color"]');
    if(!tags.length) return false;
    var colour = theme === 'dark' ? '${BAND_DARK}' : '${BAND_LIGHT}';
    for(var i=0;i<tags.length;i++){ tags[i].setAttribute('content', colour); }
    return true;
  };
  var apply = function(){
    var chosen = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = chosen || (q.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    if(!chrome(theme)){
      document.addEventListener('DOMContentLoaded', function(){ chrome(theme); }, { once: true });
    }
  };
  apply();
  var follow = function(){ if(!localStorage.getItem('${THEME_STORAGE_KEY}')) apply(); };
  if(q.addEventListener){ q.addEventListener('change', follow); }
  else if(q.addListener){ q.addListener(follow); }
}catch(e){ document.documentElement.dataset.theme = 'light'; }})();
`.trim();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Stamped on the request by the middleware, which is also what tells the
  // browser to accept exactly this value. Without it the bootstrap below is an
  // unsigned inline script and the CSP will — correctly — refuse to run it,
  // which shows up as the page loading in light mode for a night-mode user
  // rather than as an error. Absent only if the middleware did not run, in
  // which case there is no CSP to satisfy either.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      data-theme="light"
      // `globals.css` sets `scroll-behavior: smooth`, which is right for an
      // in-page anchor and wrong for a navigation — a route change scrolls to
      // top, and animating that scroll is precisely the lag we removed
      // elsewhere. Next currently suppresses it during route transitions on its
      // own, but only warns that it will stop doing so in v16. This attribute
      // is how Next wants to be told, and it keeps today's behaviour across
      // that upgrade instead of the regression arriving with a version bump.
      data-scroll-behavior="smooth"
      className={`${body.variable} ${heading.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      {/* Pages own their own horizontal rhythm: each opens with a full-bleed
          teal band and pulls its first card up into it, so `main` stays edge
          to edge and `Container` does the measuring. */}
      {/* The full-height rule lives in `globals.css` — it needs the `100vh`
          fallback under the `100dvh` that a phone actually needs, and Tailwind
          gives no ordering guarantee between two `min-h-*` classes. */}
      <body className="flex flex-col">
        <ErrorReporterMount />
        <Header />
        <main className="flex-1 w-full pb-14">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
