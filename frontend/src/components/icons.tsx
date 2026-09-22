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

export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 11.5V5a1 1 0 0 1 1-1h6.5L21 12.5 12.5 21 3 11.5Z" />
    <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
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

// ---------------------------------------------------------------------------
// El resto del juego. Todo lo que antes eran emojis sueltos repartidos por la
// app pasa por aquí: el mismo trazo de 1.75px y el mismo tamaño que la barra
// lateral, así que un icono dentro de una tabla o de un botón pesa lo mismo
// que uno del menú en vez de meter ruido de otra tipografía.
// ---------------------------------------------------------------------------

export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m6 15 6-6 6 6" />
  </Icon>
);

export const IconChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);

export const IconArrowUp = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 20V5M6 11l6-6 6 6" />
  </Icon>
);

export const IconArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </Icon>
);

// Columna ordenable sin orden aplicado: las dos direcciones a la vez.
export const IconArrowsVertical = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 9 5 6 2 9M5 6v12M16 15l3 3 3-3M19 18V6" />
  </Icon>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);

export const IconCheckCircle = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.3 2.6 2.6L16 9.5" />
  </Icon>
);

export const IconBan = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Icon>
);

export const IconHelp = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Icon>
);

export const IconInfinity = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7.5 9a3 3 0 1 0 0 6c2 0 3-1.5 4.5-3s2.5-3 4.5-3a3 3 0 1 1 0 6c-2 0-3-1.5-4.5-3S9.5 9 7.5 9Z" />
  </Icon>
);

export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.2-2.9-.5L4 20l1.3-3.3C4.5 15.5 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
  </Icon>
);

export const IconNote = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    <path d="M14 4v5h5M8 13h8M8 17h5" />
  </Icon>
);

export const IconPencil = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
);

export const IconPhone = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.5 3h3l1.5 4.5-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2L21 14.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" />
  </Icon>
);

export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </Icon>
);

export const IconKey = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8-8M17 6l2 2M15 8l2 2" />
  </Icon>
);

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </Icon>
);

export const IconTool = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 5 5L21 10a6 6 0 0 1-8.5 6.5L7 21a2.1 2.1 0 0 1-3-3l4.5-5.5A6 6 0 0 1 14 4l.5 2.5Z" />
  </Icon>
);

export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
  </Icon>
);

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 7h16M10 4h4M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3v11M7.5 10 12 14.5 16.5 10" />
    <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </Icon>
);

export const IconBell = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
    <path d="M10.5 18a1.6 1.6 0 0 0 3 0" />
  </Icon>
);

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </Icon>
);

export const IconEuro = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M17 6.5A6.5 6.5 0 0 0 7.5 12a6.5 6.5 0 0 0 9.5 5.5" />
    <path d="M4.5 10.5h8M4.5 13.5h8" />
  </Icon>
);

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </Icon>
);

export const IconStop = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Icon>
);

export const IconFlag = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 21V4M5 4.5h10l-1.5 3.5L15 11.5H5" />
  </Icon>
);

export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4" />
  </Icon>
);

export const IconFamily = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="7" cy="7.5" r="2.8" />
    <circle cx="17" cy="7.5" r="2.8" />
    <path d="M2.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5M12.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5" />
  </Icon>
);

export const IconHandshake = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.5 10 6 6.5h4l2 2 2-2h4L21.5 10" />
    <path d="M6 12.5 10 17l1.5-1.5L13.5 17l1.5-1.5L17 17l4-4.5" />
  </Icon>
);

export const IconDoor = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
    <path d="M4 21h16" />
    <circle cx="14.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconMedical = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M12 10.5v5M9.5 13h5" />
  </Icon>
);

export const IconStethoscope = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 3v5a4 4 0 0 0 8 0V3" />
    <path d="M10 12v2.5a4.5 4.5 0 0 0 9 0V13" />
    <circle cx="19" cy="11" r="2" />
  </Icon>
);

export const IconCart = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 4h2l2.5 10.5h10L20 7H6" />
    <circle cx="9.5" cy="19" r="1.3" />
    <circle cx="16.5" cy="19" r="1.3" />
  </Icon>
);

export const IconWalk = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M13 8 10 11.5l1.5 3.5L10 21M13 8l3 2.5.5 3.5M11.5 15l3 2 1 4" />
  </Icon>
);

export const IconBroom = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M16 3 9.5 9.5" />
    <path d="m12 8 4 4-6 6H5l-1-3 8-7Z" />
  </Icon>
);

export const IconMeal = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 0 0 16 0H4Z" />
    <path d="M3 20h18M12 4v1.5" />
  </Icon>
);

export const IconBox = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z" />
    <path d="m4 7.2 8 4.3 8-4.3M12 11.5V21" />
  </Icon>
);

export const IconTree = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 7 10h3l-3.5 5h11L14 10h3L12 3Z" />
    <path d="M12 15v6" />
  </Icon>
);

export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3Z" />
  </Icon>
);

export const IconList = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
  </Icon>
);

// Carné: el expediente de personal. Una tarjeta con la foto a la izquierda y
// dos líneas de datos a la derecha.
export const IconIdCard = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <circle cx="8" cy="11" r="2" />
    <path d="M5 16c.6-1.4 1.7-2 3-2s2.4.6 3 2" />
    <path d="M14.5 10.5h4M14.5 13.5h4" />
  </svg>
);
