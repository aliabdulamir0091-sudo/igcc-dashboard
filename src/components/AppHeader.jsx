import { useEffect, useMemo, useState } from "react";
import { ALL_FILTER_VALUE, COST_CENTER_HIERARCHY, getUniqueFilterValues } from "../data/costCenterHierarchy";
import { NAV_ITEMS } from "../data/navigation";
import { PORTFOLIOS } from "../data/portfolioOptions";
import financialInputsData from "../data/financialInputsData.json";
import { Icon } from "./Icons";
import igccLogo from "../assets/igcc-logo.svg";

const DEFAULT_FILTERS = {
  portfolio: ALL_FILTER_VALUE,
  hub: ALL_FILTER_VALUE,
  costCenter: ALL_FILTER_VALUE,
  period: "monthly",
  year: ALL_FILTER_VALUE,
  month: ALL_FILTER_VALUE,
  quarter: ALL_FILTER_VALUE,
};

const MONTH_OPTIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTER_OPTIONS = ["Q1", "Q2", "Q3", "Q4"];
const YEAR_OPTIONS = getUniqueFilterValues(financialInputsData.entries.map((entry) => entry.year).filter(Boolean));

export function AppHeader({ activePage, onNavigate, onMenuOpen, theme, onToggleTheme, filters, onApplyFilters, onClearFilters }) {
  const isDarkMode = theme === "dark";
  const normalizedFilters = { ...DEFAULT_FILTERS, ...filters };
  const [selectedPortfolio, setSelectedPortfolio] = useState(normalizedFilters.portfolio);
  const [selectedHub, setSelectedHub] = useState(normalizedFilters.hub);
  const [selectedCostCenter, setSelectedCostCenter] = useState(normalizedFilters.costCenter);
  const [selectedPeriod, setSelectedPeriod] = useState(normalizedFilters.period);
  const [selectedYear, setSelectedYear] = useState(normalizedFilters.year);
  const [selectedMonth, setSelectedMonth] = useState(normalizedFilters.month);
  const [selectedQuarter, setSelectedQuarter] = useState(normalizedFilters.quarter);

  useEffect(() => {
    const nextFilters = { ...DEFAULT_FILTERS, ...filters };
    setSelectedPortfolio(nextFilters.portfolio);
    setSelectedHub(nextFilters.hub);
    setSelectedCostCenter(nextFilters.costCenter);
    setSelectedPeriod(nextFilters.period);
    setSelectedYear(nextFilters.year);
    setSelectedMonth(nextFilters.month);
    setSelectedQuarter(nextFilters.quarter);
  }, [filters]);

  const commitFilters = (updates) => {
    const nextFilters = {
      portfolio: selectedPortfolio,
      hub: selectedHub,
      costCenter: selectedCostCenter,
      period: selectedPeriod,
      year: selectedYear,
      month: selectedMonth,
      quarter: selectedQuarter,
      ...updates,
    };
    onApplyFilters?.(nextFilters);
  };

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
    const portfolio = event.target.value;
    setSelectedPortfolio(portfolio);
    setSelectedHub(ALL_FILTER_VALUE);
    setSelectedCostCenter(ALL_FILTER_VALUE);
    commitFilters({ portfolio, hub: ALL_FILTER_VALUE, costCenter: ALL_FILTER_VALUE });
  };

  const handleHubChange = (event) => {
    const hub = event.target.value;
    setSelectedHub(hub);
    setSelectedCostCenter(ALL_FILTER_VALUE);
    commitFilters({ hub, costCenter: ALL_FILTER_VALUE });
  };

  const clearFilters = () => {
    setSelectedPortfolio(DEFAULT_FILTERS.portfolio);
    setSelectedHub(DEFAULT_FILTERS.hub);
    setSelectedCostCenter(DEFAULT_FILTERS.costCenter);
    setSelectedPeriod(DEFAULT_FILTERS.period);
    setSelectedYear(DEFAULT_FILTERS.year);
    setSelectedMonth(DEFAULT_FILTERS.month);
    setSelectedQuarter(DEFAULT_FILTERS.quarter);
    onClearFilters?.();
  };

  const handlePeriodChange = (event) => {
    const period = event.target.value;
    setSelectedPeriod(period);
    setSelectedMonth(ALL_FILTER_VALUE);
    setSelectedQuarter(ALL_FILTER_VALUE);
    commitFilters({ period, month: ALL_FILTER_VALUE, quarter: ALL_FILTER_VALUE });
  };

  const timeDetailLabel = selectedPeriod === "quarterly" ? "Quarter" : "Month";
  const timeDetailValue = selectedPeriod === "quarterly" ? selectedQuarter : selectedMonth;
  const timeDetailOptions = selectedPeriod === "quarterly" ? QUARTER_OPTIONS : MONTH_OPTIONS;
  const isYearly = selectedPeriod === "yearly";

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

        {activePage !== "home" ? (
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
            <select value={selectedCostCenter} onChange={(event) => {
              setSelectedCostCenter(event.target.value);
              commitFilters({ costCenter: event.target.value });
            }}>
              <option value={ALL_FILTER_VALUE}>All centers</option>
              {costCenterOptions.map((costCenter) => (
                <option key={costCenter} value={costCenter}>{costCenter}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> Period</span>
            <select value={selectedPeriod} onChange={handlePeriodChange}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> Year</span>
            <select value={selectedYear} onChange={(event) => {
              setSelectedYear(event.target.value);
              commitFilters({ year: event.target.value });
            }}>
              <option value={ALL_FILTER_VALUE}>All years</option>
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> {timeDetailLabel}</span>
            <select
              value={isYearly ? ALL_FILTER_VALUE : timeDetailValue}
              disabled={isYearly}
              onChange={(event) => {
                if (selectedPeriod === "quarterly") {
                  setSelectedQuarter(event.target.value);
                  commitFilters({ quarter: event.target.value, month: ALL_FILTER_VALUE });
                } else {
                  setSelectedMonth(event.target.value);
                  commitFilters({ month: event.target.value, quarter: ALL_FILTER_VALUE });
                }
              }}
            >
              <option value={ALL_FILTER_VALUE}>{selectedPeriod === "quarterly" ? "All quarters" : "All months"}</option>
              {timeDetailOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button type="button" className="header-clear-button" onClick={clearFilters}>Clear</button>
        </div>
        ) : null}
      </div>
    </header>
  );
}
