/**
 * Inline SVG icons — BRIEF §6 forbids an icon package, and rightly: a package
 * would be a dependency he cannot audit for a handful of paths.
 *
 * Every icon carries `aria-hidden`, because status is always accompanied by
 * text. Nothing here is the sole carrier of meaning.
 */
import type { JSX } from 'preact';

type IconProps = { size?: number } & JSX.SVGAttributes<SVGSVGElement>;

function Svg({ size = 24, children, ...rest }: IconProps & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const TickIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const CrossIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const LockIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const SortIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
    <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
  </Svg>
);

export const SettingsIcon = (props: IconProps) => (
  <Svg {...props}>
    {/* Sliders, not a gear: a gear reads as a second sun next to the theme
        toggle at 22px, which is exactly the size it is used at. */}
    <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h9M17 18h3" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="15" cy="18" r="2" />
  </Svg>
);

export const BackIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M15 19 8 12l7-7" />
  </Svg>
);

export const ImportIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Svg>
);

export const ExportIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 21V9M12 9 8 13M12 9l4 4" />
    <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const SunIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Svg>
);

export const WarnIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
);

export const UndoIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-5" />
    <path d="M4 9l4-4M4 9l4 4" />
  </Svg>
);

export const ClockIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const DotIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </Svg>
);
