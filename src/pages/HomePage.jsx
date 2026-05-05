const pageCards = [
  {
    id: "spending",
    eyebrow: "Live report",
    title: "Financial Inputs",
    detail: "Spend, AFP, GL drilldown, and CN allocation detail.",
    action: "Open inputs",
  },
  {
    id: "profitability",
    eyebrow: "Next model",
    title: "Profit & Loss",
    detail: "Cost-center profitability and allocation treatment.",
    action: "Open P&L",
  },
  {
    id: "executive",
    eyebrow: "Leadership",
    title: "Executive Cockpit",
    detail: "Review signals and board-level financial narrative.",
    action: "Open cockpit",
  },
];

const workflowSteps = ["Inputs", "Analysis", "Allocation", "Profit & Loss", "Executive Review"];

const focusItems = [
  "Review GL cost drivers",
  "Validate CN allocation treatment",
  "Prepare P&L cost-center model",
];

const readinessItems = [
  { label: "Spent report", status: "Loaded" },
  { label: "AFP data", status: "Loaded" },
  { label: "CN allocation", status: "Loaded" },
  { label: "Firebase sync", status: "Pending validation" },
];

export function HomePage({ onNavigate }) {
  return (
    <section className="home-command-page">
      <div className="home-command-heading">
        <p className="eyebrow">IGCC Financial Dashboard</p>
        <h2>Executive landing view for financial control and analysis.</h2>
        <p>Choose the right workflow, check readiness, and move into the detailed report pages without duplicating the same numbers.</p>
      </div>

      <div className="home-command-cards" aria-label="Dashboard destinations">
        {pageCards.map((card) => (
          <article key={card.id} className="home-command-card">
            <span>{card.eyebrow}</span>
            <h3>{card.title}</h3>
            <p>{card.detail}</p>
            <button type="button" onClick={() => onNavigate(card.id)}>{card.action}</button>
          </article>
        ))}
      </div>

      <section className="home-workflow-band" aria-label="Financial workflow">
        {workflowSteps.map((step, index) => (
          <div key={step} className="home-workflow-step">
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <div className="home-command-grid">
        <article className="home-focus-panel">
          <p className="eyebrow">Today&apos;s Focus</p>
          <h3>Move the analysis forward</h3>
          <div className="home-focus-list">
            {focusItems.map((item) => (
              <div key={item}>
                <span />
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="home-readiness-panel">
          <p className="eyebrow">Data Readiness</p>
          <h3>Source status</h3>
          <div className="home-readiness-list">
            {readinessItems.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.status}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
