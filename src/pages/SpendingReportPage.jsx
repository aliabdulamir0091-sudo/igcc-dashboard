export function SpendingReportPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">GL-based breakdown</p>
        <h2>Spending Report</h2>
        <p>Detailed cost tracking foundation for GL categories, vendors, periods, and cost centers.</p>
      </div>

      <div className="content-grid">
        <article className="surface-card">
          <h3>Cost tracking</h3>
          <p>Prepared for Firestore cost records and future detailed transaction drill-down.</p>
          <div className="empty-table">
            <span>GL Name</span>
            <span>Cost Center</span>
            <span>Period</span>
            <span>Amount</span>
          </div>
        </article>

        <article className="surface-card">
          <h3>Breakdown modules</h3>
          <ul className="collection-list">
            <li>GL summary</li>
            <li>Cost center summary</li>
            <li>Vendor summary</li>
            <li>Monthly movement</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
