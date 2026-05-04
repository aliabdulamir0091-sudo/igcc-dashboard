import { useState } from "react";
import { AccessDeniedPage } from "./components/AccessDeniedPage";
import { AuthPage } from "./components/AuthPage";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
import { ProfitabilityPage } from "./pages/ProfitabilityPage";
import { SpendingReportPage } from "./pages/SpendingReportPage";
import { useAuthorizedUser } from "./hooks/useAuthorizedUser";

const PAGE_COMPONENTS = {
  home: HomePage,
  executive: ExecutiveCockpitPage,
  profitability: ProfitabilityPage,
  spending: SpendingReportPage,
};

export default function App() {
  const [activePage, setActivePage] = useState("executive");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
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
    >
      <Page dataSchemas={DATA_SCHEMAS} accessProfile={accessProfile} onNavigate={setActivePage} />
    </AppLayout>
  );
}
