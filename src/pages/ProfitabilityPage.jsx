export function ProfitabilityPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">Portfolio → Hub → Cost Center</p>
        <h2>Cost Center Profitability</h2>
        <p>Detailed P&amp;L analysis foundation for revenue, cost, AFP, and CN by hierarchy.</p>
      </div>

      <div className="content-grid">
        <article className="surface-card hierarchy-card">
          <h3>Hierarchy model</h3>
          <div className="hierarchy-row">Portfolio</div>
          <div className="hierarchy-row">Hub</div>
          <div className="hierarchy-row">Cost Center</div>
        </article>

        <article className="surface-card">
          <h3>P&amp;L workspace</h3>
          <p>Prepared for approved AFP, submitted AFP, direct cost, CN adjustments, and net margin.</p>
          <div className="empty-table">
            <span>Cost Center</span>
            <span>Approved AFP</span>
            <span>Total Cost</span>
            <span>Net Position</span>
          </div>
        </article>
      </div>
    </section>
  );
}
