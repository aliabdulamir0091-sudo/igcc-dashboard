import { NAV_ITEMS } from "../data/navigation";
import igccLogo from "../assets/igcc-logo.svg";

export function AppHeader({ accessProfile, activePage, onNavigate, onMenuOpen, user }) {
  const userInitial = (user?.displayName || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <header className="app-header">
      <div className="header-main">
        <div className="brand-group">
          <button className="icon-button" type="button" onClick={onMenuOpen} aria-label="Open menu">
            <span className="hamburger-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <img className="brand-logo" src={igccLogo} alt="IGCC" />
          <div>
            <h1>Financial Dashboard</h1>
            <p>Executive financial performance cockpit</p>
          </div>
        </div>

        <div className="header-actions">
          <select aria-label="Reporting period" defaultValue="">
            <option value="">Reporting period</option>
          </select>
          <button type="button" className="export-button" disabled={!accessProfile?.permissions?.canExport}>
            Export Report
          </button>
          <div className="user-avatar" title={user?.email || "IGCC User"}>
            {userInitial}
          </div>
        </div>
      </div>

      <nav className="header-tabs" aria-label="Application navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activePage === item.id ? "is-active" : ""}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
