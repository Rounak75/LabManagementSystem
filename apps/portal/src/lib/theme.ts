// The two colours the browser chrome takes, and the one place they are written
// down.
//
// On a phone the sticky teal band runs to the very top of the page, so the
// status bar and the address bar above it have to be the same teal or there is
// a bright seam across the top of every screen. That is what `theme-color`
// buys — but only if it tracks the theme the page is *actually* in.
//
// It used to be declared as a `prefers-color-scheme` pair and resolved by the
// browser against the operating system. The header's toggle can put the page
// in a theme the OS disagrees with, and the chrome then stayed on the OS's
// answer. Keeping one media-less tag and moving it from script is what makes
// the toggle reach the chrome as well as the page.
//
// Three places read these, and they have to agree: `viewport` in `layout.tsx`
// for the server-rendered default, the pre-hydration bootstrap for first
// paint, and `ThemeToggle` for every change after that.

export const BAND_LIGHT = "#2A5F6F";
export const BAND_DARK = "#102C35";

export const THEME_STORAGE_KEY = "gjg-theme";

export function bandColor(theme: "light" | "dark"): string {
  return theme === "dark" ? BAND_DARK : BAND_LIGHT;
}

/**
 * Point the page's `theme-color` tag at the theme now in force.
 *
 * All of them, not the first: React re-inserts the metadata it rendered on the
 * server during hydration, so the live document can carry two copies of this
 * tag. The browser honours whichever comes first, and updating only that one
 * leaves a stale duplicate behind it that would take over if the order ever
 * changed. Writing to every match makes the result independent of that.
 */
export function paintChrome(theme: "light" | "dark"): void {
  const colour = bandColor(theme);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((tag) => tag.setAttribute("content", colour));
}
