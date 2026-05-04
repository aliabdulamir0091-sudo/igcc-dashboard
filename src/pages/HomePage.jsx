export function HomePage({ onNavigate }) {
  return (
    <main className="home-page">
      <nav className="home-nav">
        <div className="brand-group">
          <div className="brand-mark">IG</div>
          <div>
            <h1>IGCC Financial Dashboard</h1>
            <p>Modern financial command center</p>
          </div>
        </div>
        <button type="button" onClick={() => onNavigate("executive")}>Enter Application</button>
      </nav>

      <section className="home-hero">
        <div>
          <p className="eyebrow">Professional SaaS foundation</p>
          <h2>Executive finance intelligence, built for scale.</h2>
          <p>
            A clean application base for AFP, cost, credit note, and profitability workflows backed by Firebase and GitHub-managed delivery.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => onNavigate("executive")}>Open Executive Cockpit</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("profitability")}>View Profitability</button>
          </div>
        </div>
        <div className="hero-preview" aria-hidden="true">
          <div className="preview-top" />
          <div className="preview-grid">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-chart">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
    </main>
  );
}
