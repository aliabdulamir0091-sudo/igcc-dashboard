import { useEffect, useState } from "react";
import { AccessDeniedPage } from "./components/AccessDeniedPage";
import { AuthPage } from "./components/AuthPage";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
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
  profitability: ProfitabilityPage,
  spending: SpendingReportPage,
};

export default function App() {
  const [activePage, setActivePage] = useState("executive");
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
      filters={dashboardFilters}
      onApplyFilters={setDashboardFilters}
      onClearFilters={() => setDashboardFilters(DEFAULT_DASHBOARD_FILTERS)}
    >
      <Page dataSchemas={DATA_SCHEMAS} accessProfile={accessProfile} onNavigate={setActivePage} filters={dashboardFilters} />
    </AppLayout>
  );
}
