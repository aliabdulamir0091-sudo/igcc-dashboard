import { useEffect } from "react";
import { AppFooter } from "../components/AppFooter";
import { AppHeader } from "../components/AppHeader";
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
  theme,
  onToggleTheme,
  filters,
  onApplyFilters,
  onClearFilters,
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

  const isHomePage = activePage === "home";

  return (
    <>
      <UserSlidePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onLogout={onLogout}
        user={user}
        userProfile={userProfile}
      />
      <div className={`app-shell ${isHomePage ? "home-shell" : ""}`}>
        {!isHomePage ? (
          <AppHeader
            key={activePage}
            activePage={activePage}
            onNavigate={onNavigate}
            onMenuOpen={() => setIsPanelOpen(true)}
            theme={theme}
            onToggleTheme={onToggleTheme}
            filters={filters}
            onApplyFilters={onApplyFilters}
            onClearFilters={onClearFilters}
          />
        ) : null}
        <main className="page-content">{children}</main>
        {!isHomePage ? <AppFooter accessProfile={accessProfile} /> : null}
      </div>
    </>
  );
}
