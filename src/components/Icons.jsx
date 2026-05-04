const ICONS = {
  home: "M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  executive: "M12 3v9h9A9 9 0 0 0 12 3Zm-2 2.25A9 9 0 1 0 18.75 14H10V5.25Z",
  costCenter: "M4 21V8l8-5 8 5v13M8 21v-7h8v7M9 10h.01M12 10h.01M15 10h.01",
  pnl: "M4 19h16M6 16l4-4 3 3 6-8M19 7h-5v5",
  spending: "M7 3h8l4 4v14H7V3ZM15 3v5h4M9 13h6M9 17h6",
  submit: "M12 19V5M6 11l6-6 6 6M5 21h14",
  approve: "M20 6 9 17l-5-5",
  credit: "M4 7h16v10H4V7ZM7 11h4M15 11h2M7 15h2",
  net: "M4 19h16M7 16V8M12 16V5M17 16v-3M6 8h2M11 5h2M16 13h2",
  calendar: "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  tower: "M12 3 6 21M12 3l6 18M8 15h8M9 11h6M10 7h4",
  office: "M5 21V5h10v16M15 9h4v12M8 9h2M8 13h2M8 17h2M13 13h2M13 17h2",
  folder: "M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  hub: "M12 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM19 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 16l4-7M13 9l4 7M7 17h10",
};

export function Icon({ name, className = "" }) {
  return (
    <svg className={`svg-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
