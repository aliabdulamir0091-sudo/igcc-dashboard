import { useMemo, useState } from "react";
import { ALL_FILTER_VALUE, COST_CENTER_HIERARCHY, getUniqueFilterValues } from "../data/costCenterHierarchy";
import { NAV_ITEMS } from "../data/navigation";
import { PORTFOLIOS } from "../data/portfolioOptions";
import { Icon } from "./Icons";
import igccLogo from "../assets/igcc-logo.svg";

const HEADER_SIGNALS = [
  ["Reporting", "Live view"],
  ["Scope", "All portfolios"],
  ["Data", "Synced"],
];

export function AppHeader({ activePage, onNavigate, onMenuOpen, theme, onToggleTheme }) {
  const isDarkMode = theme === "dark";
  const [selectedRegion, setSelectedRegion] = useState(ALL_FILTER_VALUE);
  const [selectedHub, setSelectedHub] = useState(ALL_FILTER_VALUE);
  const [selectedCostCenter, setSelectedCostCenter] = useState(ALL_FILTER_VALUE);

  const regionOptions = useMemo(
    () => getUniqueFilterValues(COST_CENTER_HIERARCHY.map((item) => item.region)),
    [],
  );

  const hubOptions = useMemo(() => {
    const matchingRows = COST_CENTER_HIERARCHY.filter((item) => (
      selectedRegion === ALL_FILTER_VALUE || item.region === selectedRegion
    ));
    return getUniqueFilterValues(matchingRows.map((item) => item.hub));
  }, [selectedRegion]);

  const costCenterOptions = useMemo(() => {
    const matchingRows = COST_CENTER_HIERARCHY.filter((item) => (
      (selectedRegion === ALL_FILTER_VALUE || item.region === selectedRegion)
      && (selectedHub === ALL_FILTER_VALUE || item.hub === selectedHub)
    ));
    return getUniqueFilterValues(matchingRows.flatMap((item) => item.costCenters));
  }, [selectedHub, selectedRegion]);

  const handleRegionChange = (event) => {
    setSelectedRegion(event.target.value);
    setSelectedHub(ALL_FILTER_VALUE);
    setSelectedCostCenter(ALL_FILTER_VALUE);
  };

  const handleHubChange = (event) => {
    setSelectedHub(event.target.value);
    setSelectedCostCenter(ALL_FILTER_VALUE);
  };

  const clearFilters = () => {
    setSelectedRegion(ALL_FILTER_VALUE);
    setSelectedHub(ALL_FILTER_VALUE);
    setSelectedCostCenter(ALL_FILTER_VALUE);
  };

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
              <p>Cost, AFP, margin and portfolio performance.</p>
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
            <button
              type="button"
              className={`theme-toggle-button ${isDarkMode ? "is-active" : ""}`}
              onClick={onToggleTheme}
              aria-pressed={isDarkMode}
            >
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </button>
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
              <span className="tab-icon">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="portfolio-pills" aria-label="Portfolio shortcuts">
          {PORTFOLIOS.map((portfolio, index) => (
            <button key={portfolio.id} className={`portfolio-pill tone-${portfolio.tone} ${index === 0 ? "is-active" : ""}`} type="button">
              {portfolio.label}
            </button>
          ))}
        </div>

        <div className="header-filter-row" aria-label="Dashboard filters">
          <label>
            <span><Icon name="tower" /> Region</span>
            <select value={selectedRegion} onChange={handleRegionChange}>
              <option value={ALL_FILTER_VALUE}>All regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Icon name="hub" /> Hub</span>
            <select value={selectedHub} onChange={handleHubChange}>
              <option value={ALL_FILTER_VALUE}>All hubs</option>
              {hubOptions.map((hub) => (
                <option key={hub} value={hub}>{hub}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Icon name="costCenter" /> Cost Center</span>
            <select value={selectedCostCenter} onChange={(event) => setSelectedCostCenter(event.target.value)}>
              <option value={ALL_FILTER_VALUE}>All centers</option>
              {costCenterOptions.map((costCenter) => (
                <option key={costCenter} value={costCenter}>{costCenter}</option>
              ))}
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
          <button type="button" className="header-clear-button" onClick={clearFilters}>Clear</button>
        </div>
      </div>
    </header>
  );
}
