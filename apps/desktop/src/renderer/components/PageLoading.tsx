/**
 * What fills the content area while a page's code is being read off disk.
 *
 * Every route used to be bundled into one 3.7 MB file that had to be parsed
 * before React could paint anything, so the app opened on an empty white window
 * for as long as that took. Pages are loaded on demand now, and this is what
 * stands in for one — deliberately quiet, because on a local disk it is usually
 * on screen for a single frame and a spinner that flashes reads as a glitch.
 */
export function PageLoading() {
  return (
    <div className="flex h-full min-h-[12rem] items-center justify-center text-sm text-slate-400">
      Loading…
    </div>
  );
}
