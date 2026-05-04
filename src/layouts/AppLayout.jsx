import { useEffect } from "react";
import { AppFooter } from "../components/AppFooter";
import { AppHeader } from "../components/AppHeader";
import { FilterRow } from "../components/FilterRow";
import { UserSlidePanel } from "../components/UserSlidePanel";

export function AppLayout({
  activePage,
  onNavigate,
  isPanelOpen,
  setIsPanelOpen,
  user,
  userProfile,
  accessProfile,
  onLogout,
  children,
}) {
  useEffect(() => {
    if (!isPanelOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsPanelOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, setIsPanelOpen]);

  return (
    <>
      <UserSlidePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onLogout={onLogout}
        user={user}
        userProfile={userProfile}
      />
      <div className="app-shell">
        <AppHeader
          accessProfile={accessProfile}
          activePage={activePage}
          onNavigate={onNavigate}
          onMenuOpen={() => setIsPanelOpen(true)}
          user={user}
        />
        <FilterRow />
        <main className="page-content">{children}</main>
        <AppFooter accessProfile={accessProfile} />
      </div>
    </>
  );
}
