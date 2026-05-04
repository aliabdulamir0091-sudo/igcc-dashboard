export function FilterRow() {
  const portfolios = [
    ["Basra", "Oil Operations", "green"],
    ["Kirkuk", "Oil Operations", "blue"],
    ["Head Office", "Corporate", "purple"],
  ];

  return (
    <section className="filter-area" aria-label="Dashboard filters">
      <div className="portfolio-strip">
        <div className="portfolio-intro">
          <strong>Portfolio</strong>
          <span>Select a portfolio to view performance</span>
        </div>
        <div className="portfolio-cards">
          {portfolios.map(([name, note, tone], index) => (
            <button key={name} className={`portfolio-card tone-${tone} ${index === 0 ? "is-selected" : ""}`} type="button">
              <span className="portfolio-symbol" aria-hidden="true">{name.slice(0, 1)}</span>
              <span>
                <strong>{name}</strong>
                <small>{note}</small>
              </span>
              <span className="chevron" aria-hidden="true">v</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <label>
          Filter by Portfolio
          <select>
            <option>All portfolios</option>
          </select>
        </label>
        <label>
          Filter by Hub
          <select>
            <option>All hubs</option>
          </select>
        </label>
        <label>
          Filter by Cost Center
          <select>
            <option>All cost centers</option>
          </select>
        </label>
        <fieldset className="time-toggle">
          <legend>Time Period</legend>
          <div>
            <button className="is-active" type="button">Monthly</button>
            <button type="button">Quarterly</button>
            <button type="button">Yearly</button>
          </div>
        </fieldset>
        <label>
          Select Month
          <select>
            <option>May 2025</option>
          </select>
        </label>
      </div>
    </section>
  );
}
