// Hairline icon set. One stroke weight (1.5) across the whole portal so
// nothing reads heavier than its neighbour, and no icon dependency to ship.

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/* ─── Navigation & chrome ───────────────────────────────────────── */

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Svg>
);

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Svg>
);

export const Help = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.9-2.8 2.9" />
    <path d="M12 17.2h.01" />
  </Svg>
);

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Sun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </Svg>
);

export const Moon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79z" />
  </Svg>
);

/* ─── Actions & status ──────────────────────────────────────────── */

export const Phone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z" />
  </Svg>
);

export const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.9" />
  </Svg>
);

export const Calendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const MapPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 10.5c0 5.2-8 12-8 12s-8-6.8-8-12a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10.5" r="2.8" />
  </Svg>
);

export const User = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const Info = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const Download = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
  </Svg>
);

export const Lock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="11" rx="3" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Svg>
);

export const Logout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
    <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H16" />
  </Svg>
);

export const ShieldAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-3Z" />
    <path d="M12 9v3.5M12 15.5h.01" />
  </Svg>
);

/* ─── Domain: lab, reports, money ───────────────────────────────── */

export const Report = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Z" />
    <path d="M14 3v4h4M9.5 12.5h5M9.5 16h3" />
  </Svg>
);

export const Wallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V8.5Z" />
    <path d="M4 8.5V7a2 2 0 0 1 2-2h9" />
    <path d="M16.5 13h.01" />
  </Svg>
);

export const HomeVisit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.8V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.8" />
    <path d="M10.5 20.5v-4.2a1.5 1.5 0 0 1 3 0v4.2" />
  </Svg>
);

export const Vial = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3h8M9.5 3v13.5a2.5 2.5 0 0 0 5 0V3" />
    <path d="M9.5 11h5" />
  </Svg>
);

export const Droplet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5s5.5 5.6 5.5 9.4a5.5 5.5 0 0 1-11 0C6.5 9.1 12 3.5 12 3.5Z" />
  </Svg>
);

export const Heart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.4-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.6 12 20 12 20Z" />
  </Svg>
);

export const Pulse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h3.5l2-5.5 3.5 11 2.5-7 1.7 4H21" />
  </Svg>
);

export const Microscope = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4.5h3.5v6H9zM10.8 10.5c3.4 0 6 2.5 6 5.6" />
    <path d="M5.5 20.5h14M8 20.5a5 5 0 0 1 3-9" />
  </Svg>
);

export const Shield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-3Z" />
    <path d="m9.3 12 1.9 1.9 3.5-3.6" />
  </Svg>
);

export const Flask = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v6.5L5.4 17A2 2 0 0 0 7.1 20h9.8a2 2 0 0 0 1.7-3L14 9.5V3" />
    <path d="M9 3h6M7.6 14.5h8.8" />
  </Svg>
);

export const Hormone = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6 7.7 7.7M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </Svg>
);
