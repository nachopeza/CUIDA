import type { SVGProps } from "react";

// Set mínimo de iconos en línea (sin depender de una librería externa):
// trazo simple, 1.75px, currentColor — coherente en toda la barra lateral
// del panel de coordinación.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </Icon>
);

export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="6" y="4" width="12" height="17" rx="1.5" />
    <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M9 11h6M9 15h6M9 7h6" />
  </Icon>
);

export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
    <circle cx="17.5" cy="8.5" r="2.6" />
    <path d="M15.8 14.3c2.7.5 4.7 2.6 4.7 5.7" />
  </Icon>
);

export const IconBriefcase = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="8" width="18" height="12" rx="1.5" />
    <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 13h18" />
  </Icon>
);

export const IconBuilding = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="4" y="3" width="12" height="18" rx="1" />
    <path d="M16 8h4v13h-4" />
    <path d="M7.5 7h1M11.5 7h1M7.5 11h1M11.5 11h1M7.5 15h1M11.5 15h1" />
  </Icon>
);

export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="1.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const IconReceipt = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 2h12v19l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V2Z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const IconActivity = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
  </Icon>
);

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.35-4.35" />
  </Icon>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
  </Icon>
);
