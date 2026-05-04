import { NAV_ITEMS } from "../data/navigation";
import igccLogo from "../assets/igcc-logo.svg";

export function AppHeader({ accessProfile, activePage, onNavigate, onMenuOpen, user }) {
  const userInitial = (user?.displayName || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <header className="app-header">
      <div className="app-header-panel">
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
            <div className="brand-copy">
              <h1>Financial Dashboard</h1>
              <p>Executive financial performance cockpit</p>
            </div>
          </div>

          <div className="header-actions">
            <label className="period-control">
              <span>Reporting Period</span>
              <select aria-label="Reporting period" defaultValue="may-2025">
                <option value="may-2025">May 2025</option>
                <option value="current">Current period</option>
              </select>
            </label>
            <button type="button" className="export-button" disabled={!accessProfile?.permissions?.canExport}>
              Export Report
            </button>
            <div className="user-cluster">
              <div className="user-avatar" title={user?.email || "IGCC User"}>
                {userInitial}
              </div>
              <div>
                <strong>{user?.email?.split("@")[0] || "IGCC User"}</strong>
                <span>Authorized user</span>
              </div>
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
              <span className="tab-icon" aria-hidden="true">{item.label.slice(0, 1)}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
