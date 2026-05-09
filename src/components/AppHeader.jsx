import { useMemo } from "react";
import {
  ALL_FILTER_VALUE,
  COST_CENTER_HIERARCHY,
  ROO_SUB_HUBS,
  getCostCenterGroupByValue,
  getCostCenterGroupValue,
  getUniqueFilterValues,
} from "../data/costCenterHierarchy";
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

const getPortfolioIdForHierarchyRow = (row) => {
  if (!row) return ALL_FILTER_VALUE;
  if (row.hub === "Head Office") return "head-office";
  if (row.region === "Basra") return "basra";
  if (row.region === "Kirkuk") return "kirkuk";
  return ALL_FILTER_VALUE;
};

const getHierarchyRowByHub = (hub) => (
  hub && hub !== ALL_FILTER_VALUE
    ? COST_CENTER_HIERARCHY.find((row) => row.hub === hub)
    : null
);

const getHierarchyRowByCostCenter = (costCenter) => (
  costCenter && costCenter !== ALL_FILTER_VALUE
    ? COST_CENTER_HIERARCHY.find((row) => row.costCenters.includes(costCenter))
    : null
);

const getHierarchyRowByCostCenterFilter = (costCenter) => {
  const group = getCostCenterGroupByValue(costCenter);
  if (group) return getHierarchyRowByHub(group.hub);
  return getHierarchyRowByCostCenter(costCenter);
};

export function AppHeader({ activePage, onNavigate, onMenuOpen, theme, onToggleTheme, filters, onApplyFilters, onClearFilters }) {
  const isDarkMode = theme === "dark";
  const normalizedFilters = { ...DEFAULT_FILTERS, ...filters };
  const selectedPortfolio = normalizedFilters.portfolio;
  const selectedHub = normalizedFilters.hub;
  const selectedCostCenter = normalizedFilters.costCenter;
  const selectedPeriod = normalizedFilters.period;
  const selectedYear = normalizedFilters.year;
  const selectedMonth = normalizedFilters.month;
  const selectedQuarter = normalizedFilters.quarter;

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
    const centerOptions = getUniqueFilterValues(matchingRows.flatMap((item) => item.costCenters))
      .map((costCenter) => ({ value: costCenter, label: costCenter, type: "costCenter" }));
    if (selectedHub !== "ROO Hub") return centerOptions;
    return [
      ...ROO_SUB_HUBS.map((group) => ({
        value: getCostCenterGroupValue(group.id),
        label: group.label,
        type: "subHub",
      })),
      ...centerOptions,
    ];
  }, [selectedHub, selectedPortfolio]);

  const handlePortfolioChange = (event) => {
    const portfolio = event.target.value;
    commitFilters({ portfolio, hub: ALL_FILTER_VALUE, costCenter: ALL_FILTER_VALUE });
  };

  const handleHubChange = (event) => {
    const hub = event.target.value;
    const hierarchyRow = getHierarchyRowByHub(hub);
    const portfolio = hierarchyRow ? getPortfolioIdForHierarchyRow(hierarchyRow) : selectedPortfolio;
    commitFilters({ portfolio, hub, costCenter: ALL_FILTER_VALUE });
  };

  const handleCostCenterChange = (event) => {
    const costCenter = event.target.value;
    const hierarchyRow = getHierarchyRowByCostCenterFilter(costCenter);
    const portfolio = hierarchyRow ? getPortfolioIdForHierarchyRow(hierarchyRow) : selectedPortfolio;
    const hub = hierarchyRow ? hierarchyRow.hub : selectedHub;
    commitFilters({ portfolio, hub, costCenter });
  };

  const clearFilters = () => {
    onClearFilters?.();
  };

  const handlePeriodChange = (event) => {
    const period = event.target.value;
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
            <span><Icon name="costCenter" /> {selectedHub === "ROO Hub" ? "ROO Sub Hub / Cost Center" : "Cost Center"}</span>
            <select value={selectedCostCenter} onChange={handleCostCenterChange}>
              <option value={ALL_FILTER_VALUE}>{selectedHub === "ROO Hub" ? "All ROO Hub" : "All centers"}</option>
              {selectedHub === "ROO Hub" ? (
                <>
                  <optgroup label="ROO sub hubs">
                    {costCenterOptions.filter((option) => option.type === "subHub").map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="ROO cost centers">
                    {costCenterOptions.filter((option) => option.type === "costCenter").map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                </>
              ) : costCenterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
                  commitFilters({ quarter: event.target.value, month: ALL_FILTER_VALUE });
                } else {
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
