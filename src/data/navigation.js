export const NAV_ITEMS = [
  { id: "home", icon: "home", label: "Home" },
  { id: "executive", icon: "executive", label: "Executive Cockpit" },
  { id: "cost-center", icon: "costCenter", label: "Cost Center" },
  { id: "profitability", icon: "pnl", label: "Profit and Lose" },
  { id: "spending", icon: "spending", label: "Spent Report" },
];

export const APP_PAGES = NAV_ITEMS.map((item) => item.id);
