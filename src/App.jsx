import { useEffect, useState } from "react";
import { AccessDeniedPage } from "./components/AccessDeniedPage";
import { AuthPage } from "./components/AuthPage";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_GROUPS,
  COST_CENTER_HIERARCHY,
  getCostCenterGroupByValue,
  getCostCenterGroupValue,
} from "./data/costCenterHierarchy";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { AfpDashboardPage } from "./pages/AfpDashboardPage";
import { CostCenterEfficiencyPage } from "./pages/CostCenterEfficiencyPage";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
import { ProfitMatrixPage } from "./pages/ProfitMatrixPage";
import { ProfitabilityPage } from "./pages/ProfitabilityPage";
import { SpendingReportPage } from "./pages/SpendingReportPage";
import { useAuthorizedUser } from "./hooks/useAuthorizedUser";

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
  efficiency: CostCenterEfficiencyPage,
  profitMatrix: ProfitMatrixPage,
  afp: AfpDashboardPage,
  detail: ProfitabilityPage,
  spending: SpendingReportPage,
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
  const [dashboardFilters, setDashboardFilters] = useState(DEFAULT_DASHBOARD_FILTERS);
  const {
    user,
    accessProfile,
    accessDenied,
    authError,
    isCheckingUser,
    resetAccessDenied,
    signOutUser,
  } = useAuthorizedUser();
  const handleLogout = async () => {
    setIsPanelOpen(false);
    await signOutUser();
  };
  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("igcc-theme", theme);
  }, [theme]);

  if (accessDenied) {
    return (
      <AccessDeniedPage
        detail={accessDenied.detail}
        deniedEmail={accessDenied.email}
        projectId={accessDenied.projectId}
        reason={accessDenied.reason}
        onBackToLogin={resetAccessDenied}
      />
    );
  }

  if (!user) {
    return <AuthPage authError={authError} isCheckingUser={isCheckingUser} />;
  }

  const Page = PAGE_COMPONENTS[activePage] ?? ExecutiveCockpitPage;
  const sanitizedDashboardFilters = sanitizeDashboardFilters(dashboardFilters);
  const applyDashboardFilters = (filters) => {
    setDashboardFilters(sanitizeDashboardFilters(filters));
  };

  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      isPanelOpen={isPanelOpen}
      setIsPanelOpen={setIsPanelOpen}
      user={user}
      userProfile={accessProfile}
      accessProfile={accessProfile}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
      filters={sanitizedDashboardFilters}
      onApplyFilters={applyDashboardFilters}
      onClearFilters={() => setDashboardFilters(DEFAULT_DASHBOARD_FILTERS)}
    >
      <Page
        activePage={activePage}
        dataSchemas={DATA_SCHEMAS}
        accessProfile={accessProfile}
        onNavigate={setActivePage}
        filters={sanitizedDashboardFilters}
        onApplyFilters={applyDashboardFilters}
      />
    </AppLayout>
  );
}
