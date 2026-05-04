import { useEffect, useMemo, useState } from "react";
import { ALL_FILTER_VALUE, COST_CENTER_HIERARCHY, getUniqueFilterValues } from "../data/costCenterHierarchy";
import { NAV_ITEMS } from "../data/navigation";
import { PORTFOLIOS } from "../data/portfolioOptions";
import { Icon } from "./Icons";
import igccLogo from "../assets/igcc-logo.svg";

export function AppHeader({ activePage, onNavigate, onMenuOpen, theme, onToggleTheme, filters, onApplyFilters, onClearFilters }) {
  const isDarkMode = theme === "dark";
  const [selectedPortfolio, setSelectedPortfolio] = useState(filters?.portfolio || ALL_FILTER_VALUE);
  const [selectedHub, setSelectedHub] = useState(filters?.hub || ALL_FILTER_VALUE);
  const [selectedCostCenter, setSelectedCostCenter] = useState(filters?.costCenter || ALL_FILTER_VALUE);
  const [selectedPeriod, setSelectedPeriod] = useState(filters?.period || ALL_FILTER_VALUE);
  const [selectedMonth, setSelectedMonth] = useState(filters?.month || ALL_FILTER_VALUE);

  useEffect(() => {
    setSelectedPortfolio(filters?.portfolio || ALL_FILTER_VALUE);
    setSelectedHub(filters?.hub || ALL_FILTER_VALUE);
    setSelectedCostCenter(filters?.costCenter || ALL_FILTER_VALUE);
    setSelectedPeriod(filters?.period || ALL_FILTER_VALUE);
    setSelectedMonth(filters?.month || ALL_FILTER_VALUE);
  }, [filters]);

  const hubOptions = useMemo(() => {
    const matchingRows = COST_CENTER_HIERARCHY.filter((item) => (
      selectedPortfolio === ALL_FILTER_VALUE
      || (selectedPortfolio === "basra" && item.region === "Basra")
      || (selectedPortfolio === "kirkuk" && item.region === "Kirkuk")
      || (selectedPortfolio === "head-office" && item.hub === "Head Office")
    ));
    return getUniqueFilterValues(matchingRows.map((item) => item.hub));
  }, [selectedPortfolio]);

  const costCenterOptions = useMemo(() => {
    const matchingRows = COST_CENTER_HIERARCHY.filter((item) => (
      (selectedPortfolio === ALL_FILTER_VALUE
        || (selectedPortfolio === "basra" && item.region === "Basra")
        || (selectedPortfolio === "kirkuk" && item.region === "Kirkuk")
        || (selectedPortfolio === "head-office" && item.hub === "Head Office"))
      && (selectedHub === ALL_FILTER_VALUE || item.hub === selectedHub)
    ));
    return getUniqueFilterValues(matchingRows.flatMap((item) => item.costCenters));
  }, [selectedHub, selectedPortfolio]);

  const handlePortfolioChange = (event) => {
    setSelectedPortfolio(event.target.value);
    setSelectedHub(ALL_FILTER_VALUE);
    setSelectedCostCenter(ALL_FILTER_VALUE);
  };

  const handleHubChange = (event) => {
    setSelectedHub(event.target.value);
    setSelectedCostCenter(ALL_FILTER_VALUE);
  };

  const clearFilters = () => {
    setSelectedPortfolio(ALL_FILTER_VALUE);
    setSelectedHub(ALL_FILTER_VALUE);
    setSelectedCostCenter(ALL_FILTER_VALUE);
    setSelectedPeriod(ALL_FILTER_VALUE);
    setSelectedMonth(ALL_FILTER_VALUE);
    onClearFilters?.();
  };

  const applyFilters = () => {
    onApplyFilters?.({
      portfolio: selectedPortfolio,
      hub: selectedHub,
      costCenter: selectedCostCenter,
      period: selectedPeriod,
      month: selectedMonth,
    });
  };

  return (
    <header className="app-header">
      <div className="app-header-panel">
        <div className="header-nav-layer">
          <div className="brand-group">
            <span className="brand-logo-wrap">
              <img className="brand-logo" src={igccLogo} alt="IGCC" />
            </span>
            <div className="brand-copy">
              <h1>Financial Dashboard</h1>
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

          <div className="header-actions">
            <button
              type="button"
              className={`theme-toggle-button ${isDarkMode ? "is-active" : ""}`}
              onClick={onToggleTheme}
              aria-pressed={isDarkMode}
            >
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </button>
            <button className="icon-button" type="button" onClick={onMenuOpen} aria-label="Open menu">
              <span className="hamburger-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>

        <div className="header-filter-row" aria-label="Dashboard filters">
          <label>
            <span><Icon name="folder" /> Portfolio</span>
            <select value={selectedPortfolio} onChange={handlePortfolioChange}>
              {PORTFOLIOS.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>{portfolio.label}</option>
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
          <label>
            <span><Icon name="calendar" /> Period</span>
            <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
              <option value={ALL_FILTER_VALUE}>All periods</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> Month</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              <option value={ALL_FILTER_VALUE}>All months</option>
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </label>
          <button type="button" className="header-apply-button" onClick={applyFilters}>Apply Filters</button>
          <button type="button" className="header-clear-button" onClick={clearFilters}>Clear</button>
        </div>
      </div>
    </header>
  );
}
