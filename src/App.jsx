import { useEffect, useState } from "react";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_GROUPS,
  COST_CENTER_HIERARCHY,
  getCostCenterGroupByValue,
  getCostCenterGroupValue,
} from "./data/costCenterHierarchy";
import { getRolePermissions } from "./data/accessControl";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { AfpDashboardPage } from "./pages/AfpDashboardPage";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
import { ProfitMatrixPage } from "./pages/ProfitMatrixPage";
import { ProfitabilityPage } from "./pages/ProfitabilityPage";
import { SpendingReportPage } from "./pages/SpendingReportPage";

const DEFAULT_DASHBOARD_FILTERS = {
  portfolio: "all",
  hub: "all",
  costCenter: "all",
  period: "monthly",
  year: "all",
  month: "all",
  quarter: "all",
};

const PAGE_COMPONENTS = {
  home: HomePage,
  executive: ExecutiveCockpitPage,
  profitMatrix: ProfitMatrixPage,
  afp: AfpDashboardPage,
  detail: ProfitabilityPage,
  spending: SpendingReportPage,
};

const createDefaultFilters = () => ({ ...DEFAULT_DASHBOARD_FILTERS });

const createPageFilters = () => Object.keys(PAGE_COMPONENTS).reduce((pageFilters, pageId) => {
  pageFilters[pageId] = createDefaultFilters();
  return pageFilters;
}, {});

const PUBLIC_USER = {
  displayName: "IGCC Executive",
  email: "executive@igccgroup.com",
};

const PUBLIC_ACCESS_PROFILE = {
  active: true,
  displayName: "IGCC Executive",
  email: PUBLIC_USER.email,
  id: "public-executive",
  role: "Admin",
  source: "public-dashboard",
  permissions: getRolePermissions("Admin"),
};

const matchesPortfolio = (row, portfolio) => (
  portfolio === ALL_FILTER_VALUE
  || (portfolio === "basra" && row.region === "Basra")
  || (portfolio === "kirkuk" && row.region === "Kirkuk")
  || (portfolio === "head-office" && row.hub === "Head Office")
);

const getValidCostCenterFilters = (portfolio, hub) => {
  const matchingRows = COST_CENTER_HIERARCHY.filter((row) => (
    matchesPortfolio(row, portfolio)
    && (hub === ALL_FILTER_VALUE || row.hub === hub)
  ));
  const costCenters = matchingRows.flatMap((row) => row.costCenters);
  const groups = COST_CENTER_GROUPS
    .filter((group) => (
      (hub === ALL_FILTER_VALUE || group.hub === hub)
      && matchingRows.some((row) => row.hub === group.hub)
    ))
    .map((group) => getCostCenterGroupValue(group.id));

  return new Set([ALL_FILTER_VALUE, ...costCenters, ...groups]);
};

const sanitizeDashboardFilters = (filters) => {
  const nextFilters = { ...DEFAULT_DASHBOARD_FILTERS, ...filters };
  const portfolio = nextFilters.portfolio || ALL_FILTER_VALUE;
  const hub = nextFilters.hub || ALL_FILTER_VALUE;
  const validHubs = new Set([
    ALL_FILTER_VALUE,
    ...COST_CENTER_HIERARCHY.filter((row) => matchesPortfolio(row, portfolio)).map((row) => row.hub),
  ]);

  if (!validHubs.has(hub)) {
    nextFilters.hub = ALL_FILTER_VALUE;
    nextFilters.costCenter = ALL_FILTER_VALUE;
  }

  const validCostCenters = getValidCostCenterFilters(portfolio, nextFilters.hub);
  const selectedGroup = getCostCenterGroupByValue(nextFilters.costCenter);
  if (
    !validCostCenters.has(nextFilters.costCenter)
    || (selectedGroup && nextFilters.hub !== ALL_FILTER_VALUE && selectedGroup.hub !== nextFilters.hub)
  ) {
    nextFilters.costCenter = ALL_FILTER_VALUE;
  }

  if (nextFilters.period === "yearly") {
    nextFilters.month = ALL_FILTER_VALUE;
    nextFilters.quarter = ALL_FILTER_VALUE;
  }

  return nextFilters;
};

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("igcc-theme") || "light");
  const [dashboardFiltersByPage, setDashboardFiltersByPage] = useState(createPageFilters);
  const handleLogout = () => {
    setIsPanelOpen(false);
  };
  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("igcc-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (activePage === "detail") return;

    setDashboardFiltersByPage((currentFiltersByPage) => ({
      ...currentFiltersByPage,
      [activePage]: createDefaultFilters(),
    }));
  }, [activePage]);

  const Page = PAGE_COMPONENTS[activePage] ?? ExecutiveCockpitPage;
  const currentPageFilters = dashboardFiltersByPage[activePage] ?? DEFAULT_DASHBOARD_FILTERS;
  const sanitizedDashboardFilters = sanitizeDashboardFilters(currentPageFilters);
  const applyDashboardFilters = (filters, targetPage = activePage) => {
    setDashboardFiltersByPage((currentFiltersByPage) => ({
      ...currentFiltersByPage,
      [targetPage]: sanitizeDashboardFilters(filters),
    }));
  };
  const navigatePage = (targetPage, options = {}) => {
    if (!options.preserveFilters) {
      setDashboardFiltersByPage((currentFiltersByPage) => ({
        ...currentFiltersByPage,
        [targetPage]: createDefaultFilters(),
      }));
    }
    setActivePage(targetPage);
  };
  const clearDashboardFilters = (targetPage = activePage) => {
    setDashboardFiltersByPage((currentFiltersByPage) => ({
      ...currentFiltersByPage,
      [targetPage]: createDefaultFilters(),
    }));
  };

  return (
    <AppLayout
      activePage={activePage}
      onNavigate={navigatePage}
      isPanelOpen={isPanelOpen}
      setIsPanelOpen={setIsPanelOpen}
      user={PUBLIC_USER}
      userProfile={PUBLIC_ACCESS_PROFILE}
      accessProfile={PUBLIC_ACCESS_PROFILE}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
      filters={sanitizedDashboardFilters}
      onApplyFilters={applyDashboardFilters}
      onClearFilters={clearDashboardFilters}
    >
      <Page
        key={activePage}
        activePage={activePage}
        dataSchemas={DATA_SCHEMAS}
        accessProfile={PUBLIC_ACCESS_PROFILE}
        onNavigate={navigatePage}
        filters={sanitizedDashboardFilters}
        onApplyFilters={applyDashboardFilters}
      />
    </AppLayout>
  );
}
