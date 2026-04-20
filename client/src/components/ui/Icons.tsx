import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const Icon = {
  Dashboard: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ),
  FilePlus: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M14 3v5h5" /><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M12 11v6M9 14h6" /></svg>
  ),
  Inbox: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></svg>
  ),
  Users: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  Book: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>
  ),
  Activity: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  ),
  Logout: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
  ),
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></svg>
  ),
  Bell: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
  ),
  Sun: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
  ),
  Moon: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" /></svg>
  ),
  Plus: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  Menu: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
  ),
  X: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  ChevronRight: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="m9 18 6-6-6-6" /></svg>
  ),
  ChevronLeft: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="m15 18-6-6 6-6" /></svg>
  ),
  ChevronDown: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
  ),
  Refresh: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /></svg>
  ),
  Copy: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  ),
  External: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M15 3h6v6M10 14 21 3M18 13v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7" /></svg>
  ),
  Github: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5a5.403 5.403 0 0 0-1 3.5c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
  ),
  Upload: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="m20 6-11 11-5-5" /></svg>
  ),
  AlertTriangle: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01" /></svg>
  ),
  MoreHorizontal: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
  ),
  Calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  ),
  Sparkles: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /><path d="M19 16v3M17.5 17.5h3" /></svg>
  ),
  FileCode: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M14 3v5h5M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="m9 13-2 2 2 2M13 13l2 2-2 2" /></svg>
  ),
  Edit: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" /></svg>
  ),
  Trash: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
  ),
  Link: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
  ),
  Clock: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
  ),
};
