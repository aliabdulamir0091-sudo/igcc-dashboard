import { NAV_ITEMS } from "../data/navigation";

export function AppHeader({ accessProfile, activePage, onNavigate, onMenuOpen, user }) {
  const userInitial = (user?.displayName || user?.email || "U").slice(0, 1).toUpperCase();
  const role = accessProfile?.role || "Viewer";
  const isReadOnly = accessProfile?.permissions?.mode === "read-only";

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
          <div className="brand-mark">IG</div>
          <div>
            <h1>Financial Dashboard</h1>
            <p>Executive financial performance cockpit</p>
          </div>
        </div>

        <div className="header-actions">
          <span className="role-pill">
            {role}
            {isReadOnly ? " / Read only" : ""}
          </span>
          <select aria-label="Reporting period" defaultValue="">
            <option value="">Reporting period</option>
          </select>
          <button type="button" className="export-button" disabled={!accessProfile?.permissions?.canExport}>
            Export Report
          </button>
          <button type="button" className="icon-button" aria-label="Notifications">
            !
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
