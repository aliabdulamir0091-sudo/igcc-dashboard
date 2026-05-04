import { useState } from "react";
import { AuthPage } from "./components/AuthPage";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
import { ProfitabilityPage } from "./pages/ProfitabilityPage";
import { SpendingReportPage } from "./pages/SpendingReportPage";
import { useAuthorizedUser } from "./hooks/useAuthorizedUser";

const PAGE_COMPONENTS = {
  executive: ExecutiveCockpitPage,
  profitability: ProfitabilityPage,
  spending: SpendingReportPage,
};

export default function App() {
  const [activePage, setActivePage] = useState("executive");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { user, profile, authError, isCheckingUser, signOutUser } = useAuthorizedUser();
  const handleLogout = async () => {
    setIsPanelOpen(false);
    await signOutUser();
  };

  if (!user) {
    return <AuthPage authError={authError} isCheckingUser={isCheckingUser} />;
  }

  if (activePage === "home") {
    return <HomePage onNavigate={setActivePage} />;
  }

  const Page = PAGE_COMPONENTS[activePage] ?? ExecutiveCockpitPage;

  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      isPanelOpen={isPanelOpen}
      setIsPanelOpen={setIsPanelOpen}
      user={user}
      userProfile={profile}
      onLogout={handleLogout}
    >
      <Page dataSchemas={DATA_SCHEMAS} />
    </AppLayout>
  );
}
