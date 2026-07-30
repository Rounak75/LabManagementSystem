import { NavDock, type DockItem } from "./NavDock";
import { ThemeToggle } from "./ThemeToggle";
import { Container } from "./ui";

// Equal gaps, equal padding — one rhythm across the bar, including the
// sign-in pill. NavDock adds the proximity magnification on top.
const NAV: DockItem[] = [
  { href: "/", label: "Home" },
  { href: "/info", label: "Lab info" },
  { href: "/tests", label: "Tests" },
  { href: "/book", label: "Book visit" },
  { href: "/login", label: "Sign in", primary: true },
];

export function Header() {
  return (
    // Teal, and the page band beneath it is the same teal — the two read as
    // one surface until you scroll, which is the point.
    <header className="band sticky top-0 z-40">
      <Container>
        <nav aria-label="Main" className="flex h-16 items-center justify-center">
          <NavDock items={NAV} action={<ThemeToggle />} />
        </nav>
      </Container>
    </header>
  );
}
