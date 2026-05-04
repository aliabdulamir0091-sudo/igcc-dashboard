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
  const [activePage, setActivePage] = useState("home");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { user, profile, authError, isCheckingUser, signOutUser } = useAuthorizedUser();

  if (activePage === "home") {
    return <HomePage onNavigate={setActivePage} />;
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
      userProfile={profile}
      onLogout={signOutUser}
    >
      <Page dataSchemas={DATA_SCHEMAS} />
    </AppLayout>
  );
}
