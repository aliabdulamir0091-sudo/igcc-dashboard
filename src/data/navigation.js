export const NAV_ITEMS = [
  { id: "home", icon: "home", label: "Home" },
  { id: "executive", icon: "executive", label: "Executive Cockpit" },
  { id: "spending", icon: "spending", label: "Financial Inputs" },
  { id: "profitability", icon: "pnl", label: "Profit & Loss" },
];

export const APP_PAGES = NAV_ITEMS.map((item) => item.id);
