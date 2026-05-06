import { Icon } from "../components/Icons";
import { NAV_ITEMS } from "../data/navigation";
import igccLogo from "../assets/igcc-logo.svg";

const pageCards = [
  {
    id: "executive",
    icon: "executive",
    title: "Executive Cockpit",
    detail: "Leadership summary and review signals",
    action: "Open",
  },
  {
    id: "profitability",
    icon: "pnl",
    title: "Profit and Lose",
    detail: "Cost-center profitability and allocation treatment",
    action: "Open",
  },
  {
    id: "spending",
    icon: "spending",
    title: "Financial Input",
    detail: "Spend, AFP, GL drilldown, CN allocation detail",
    action: "Open",
  },
];

const workflowSteps = [
  { icon: "spending", title: "Inputs", detail: "Collect & validate financial data" },
  { icon: "executive", title: "Analysis", detail: "Analyze spend and performance" },
  { icon: "hub", title: "Allocation", detail: "Allocate costs and credit notes" },
  { icon: "pnl", title: "Profit & Loss", detail: "Calculate cost-center profitability" },
  { icon: "credit", title: "Executive Review", detail: "Review insights and make decisions" },
];

const focusItems = [
  { icon: "executive", title: "Review GL cost drivers", detail: "Identify top cost centers and GL items driving spend" },
  { icon: "credit", title: "Validate CN allocation treatment", detail: "Review credit note allocations by receiving cost centers" },
  { icon: "pnl", title: "Prepare P&L cost-center model", detail: "Continue building cost-center profitability model" },
];

const readinessItems = [
  { icon: "folder", label: "Spent report", detail: "Cost and expense data", status: "Loaded", tone: "ready", time: "May 5, 2026 09:12 AM" },
  { icon: "approve", label: "AFP (Revenue)", detail: "Approved financial plan", status: "Loaded", tone: "ready", time: "May 5, 2026 09:10 AM" },
  { icon: "credit", label: "CN allocation", detail: "Credit note allocation detail", status: "Loaded", tone: "ready", time: "May 5, 2026 09:11 AM" },
  { icon: "download", label: "Firebase sync", detail: "Cloud data synchronization", status: "Pending", tone: "pending", time: "May 5, 2026 09:08 AM" },
];

const sideItems = [
  { id: "home", icon: "home", label: "Home" },
  { id: "executive", icon: "executive", label: "Executive Cockpit" },
  { id: "profitability", icon: "pnl", label: "Profit and Lose" },
  { id: "spending", icon: "spending", label: "Financial Input" },
  { id: "data", icon: "download", label: "Data & Sync" },
  { id: "settings", icon: "folder", label: "Settings" },
];

export function HomePage({ onNavigate, accessProfile }) {
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <section className="home-dashboard-frame">
      <aside className="home-sidebar">
        <div className="home-sidebar-brand">
          <img className="home-brand-logo" src={igccLogo} alt="" />
          <strong>IGCC</strong>
          <small>Financial</small>
        </div>

        <nav className="home-sidebar-nav" aria-label="Home navigation">
          {sideItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === "home" ? "is-active" : ""}
              onClick={() => {
                if (NAV_ITEMS.some((navItem) => navItem.id === item.id)) onNavigate(item.id);
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="home-admin-card">
          <span>{accessProfile?.email?.slice(0, 2).toUpperCase() || "AD"}</span>
          <div>
            <strong>{accessProfile?.displayName || "Admin"}</strong>
            <small>IGCC Team</small>
          </div>
        </div>
      </aside>

      <div className="home-dashboard-main">
        <header className="home-dashboard-hero">
          <span className="home-hero-icon"><Icon name="executive" /></span>
          <div>
            <h1>IGCC Financial Dashboard</h1>
            <p>Executive landing view for financial control and analysis</p>
          </div>
          <div className="home-hero-actions">
            <span><Icon name="calendar" /> {today}</span>
            <button type="button"><Icon name="filter" /> All Filters</button>
          </div>
        </header>

        <section className="home-page-cards" aria-label="Dashboard destinations">
          {pageCards.map((card) => (
            <article key={card.id} className="home-page-card">
              <span className="home-page-card-icon"><Icon name={card.icon} /></span>
              <div>
                <h2>{card.title}</h2>
                <p>{card.detail}</p>
              </div>
              <button type="button" onClick={() => onNavigate(card.id)}>{card.action}</button>
              <i aria-hidden="true">&rarr;</i>
            </article>
          ))}
        </section>

        <section className="home-workflow-panel" aria-label="Financial workflow">
          <div className="home-workflow-copy">
            <h2>Financial Workflow</h2>
            <p>End-to-end control and analysis</p>
          </div>
          <div className="home-workflow-track">
            {workflowSteps.map((step) => (
              <article key={step.title}>
                <span><Icon name={step.icon} /></span>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-bottom-grid">
          <article className="home-action-panel">
            <div className="home-panel-title">
              <span><Icon name="executive" /></span>
              <div>
                <h2>Today&apos;s Focus</h2>
                <p>Key actions to drive financial control</p>
              </div>
            </div>
            <div className="home-action-list">
              {focusItems.map((item) => (
                <button key={item.title} type="button">
                  <span><Icon name={item.icon} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <i aria-hidden="true">&gt;</i>
                </button>
              ))}
            </div>
            <button className="home-link-button" type="button">View all actions <i aria-hidden="true">&gt;</i></button>
          </article>

          <article className="home-readiness-panel-v2">
            <div className="home-panel-title">
              <span><Icon name="folder" /></span>
              <div>
                <h2>Data Readiness</h2>
                <p>Current status of data sources and system</p>
              </div>
              <button type="button">View data & sync <i aria-hidden="true">&gt;</i></button>
            </div>
            <div className="home-readiness-rows">
              {readinessItems.map((item) => (
                <div key={item.label}>
                  <span className="home-readiness-icon"><Icon name={item.icon} /></span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <em className={`tone-${item.tone}`}>{item.status}</em>
                  <time>{item.time}</time>
                </div>
              ))}
            </div>
            <button className="home-link-button" type="button">View sync history <i aria-hidden="true">&gt;</i></button>
          </article>
        </section>
      </div>
    </section>
  );
}
