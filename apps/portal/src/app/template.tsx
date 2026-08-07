// One file, one job: every page in the portal fades in when you arrive on it.
//
// A `layout.tsx` persists across navigations, which is what makes it the wrong
// place for this — its children change but the element does not remount, so a
// CSS animation on it plays once on first load and never again. `template.tsx`
// remounts on every navigation, so the animation replays each time. That is the
// whole reason this file exists rather than a class on `<main>`.
//
// The animation itself is in `globals.css` under `.page-in`. It runs on the
// loading skeleton and on the page that replaces it alike, so a slow route
// still fades rather than snapping.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
