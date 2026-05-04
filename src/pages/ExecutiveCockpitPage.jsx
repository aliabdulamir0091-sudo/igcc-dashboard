import { FIRESTORE_COLLECTIONS } from "../data/firestoreCollections";

export function ExecutiveCockpitPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">CEO-level dashboard</p>
        <h2>Executive Cockpit</h2>
        <p>KPI summary, executive insights, trends, and portfolio-level financial health will load from Firestore.</p>
      </div>

      <div className="kpi-grid">
        {["Net Position", "Approved AFP", "Total Cost", "CN Impact"].map((label) => (
          <article key={label} className="metric-card">
            <span>{label}</span>
            <strong>Awaiting data</strong>
            <p>Source: Firestore</p>
          </article>
        ))}
      </div>

      <div className="content-grid">
        <article className="surface-card">
          <h3>Executive trend canvas</h3>
          <p>Prepared for costs, AFP, and CN movement across reporting periods.</p>
          <div className="empty-visual" />
        </article>
        <article className="surface-card">
          <h3>Firestore collections</h3>
          <ul className="collection-list">
            {[FIRESTORE_COLLECTIONS.costCenters, FIRESTORE_COLLECTIONS.afp, FIRESTORE_COLLECTIONS.costs, FIRESTORE_COLLECTIONS.creditNotes].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
