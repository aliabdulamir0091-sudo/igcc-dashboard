import { NAV_ITEMS } from "../data/navigation";
import { PORTFOLIOS } from "../data/portfolioOptions";
import { Icon } from "./Icons";
import igccLogo from "../assets/igcc-logo.svg";

const HEADER_SIGNALS = [
  ["Reporting", "Executive live view"],
  ["Scope", "All portfolios"],
  ["Data", "Auto refreshed"],
];

export function AppHeader({ activePage, onNavigate, onMenuOpen, theme, onToggleTheme }) {
  const isDarkMode = theme === "dark";

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
            <span className="brand-logo-wrap">
              <img className="brand-logo" src={igccLogo} alt="IGCC" />
            </span>
            <div className="brand-copy">
              <span className="company-name">Iraq Gate Contracting Company</span>
              <h1>Financial Dashboard</h1>
              <p>Executive view of cost, AFP approval, profitability, and portfolio performance.</p>
            </div>
          </div>

          <div className="header-actions">
            <div className="header-status-grid" aria-label="Dashboard status">
              {HEADER_SIGNALS.map(([label, value]) => (
                <div className="header-status-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="portfolio-pills" aria-label="Portfolio shortcuts">
          {PORTFOLIOS.map((portfolio, index) => (
            <button key={portfolio.id} className={`portfolio-pill tone-${portfolio.tone} ${index === 0 ? "is-active" : ""}`} type="button">
              {portfolio.label}
            </button>
          ))}
        </div>

        <div className="header-filter-row" aria-label="Dashboard filters">
          <label>
            <span><Icon name="hub" /> Hub</span>
            <select>
              <option>All hubs</option>
            </select>
          </label>
          <label>
            <span><Icon name="costCenter" /> Cost Center</span>
            <select>
              <option>All centers</option>
            </select>
          </label>
          <fieldset>
            <legend><Icon name="calendar" /> Time Mode</legend>
            <div>
              <button className="is-active" type="button">Monthly</button>
              <button type="button">Quarterly</button>
              <button type="button">Yearly</button>
            </div>
          </fieldset>
          <label>
            <span><Icon name="calendar" /> Year</span>
            <select>
              <option>All years</option>
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> Month</span>
            <select>
              <option>All months</option>
            </select>
          </label>
          <button type="button" className="header-clear-button">Clear</button>
        </div>

        <nav className="header-tabs" aria-label="Application navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activePage === item.id ? "is-active" : ""}
              onClick={() => onNavigate(item.id)}
            >
              <span className="tab-icon">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`dark-mode-button ${isDarkMode ? "is-active" : ""}`}
            onClick={onToggleTheme}
            aria-pressed={isDarkMode}
          >
            {isDarkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </nav>
      </div>
    </header>
  );
}
