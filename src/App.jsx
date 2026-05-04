import { useState } from "react";
import { DATA_SCHEMAS } from "./data/firestoreCollections";
import { AppLayout } from "./layouts/AppLayout";
import { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
import { HomePage } from "./pages/HomePage";
import { ProfitabilityPage } from "./pages/ProfitabilityPage";
import { SpendingReportPage } from "./pages/SpendingReportPage";
import { useFirebaseUser } from "./hooks/useFirebaseUser";

const PAGE_COMPONENTS = {
  executive: ExecutiveCockpitPage,
  profitability: ProfitabilityPage,
  spending: SpendingReportPage,
};

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { user } = useFirebaseUser();

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
    >
      <Page dataSchemas={DATA_SCHEMAS} />
    </AppLayout>
  );
}
