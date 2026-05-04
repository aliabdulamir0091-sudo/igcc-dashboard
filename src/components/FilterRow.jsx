import { Icon } from "./Icons";

export function FilterRow() {
  const portfolios = [
    ["Basra", "Oil Operations", "green", "tower"],
    ["Kirkuk", "Oil Operations", "blue", "tower"],
    ["Head Office", "Corporate", "purple", "office"],
  ];

  return (
    <section className="filter-area" aria-label="Dashboard filters">
      <div className="portfolio-strip">
        <div className="portfolio-intro">
          <strong>Portfolio</strong>
          <span>Select a portfolio to view performance</span>
        </div>
        <div className="portfolio-cards">
          {portfolios.map(([name, note, tone, icon], index) => (
            <button key={name} className={`portfolio-card tone-${tone} ${index === 0 ? "is-selected" : ""}`} type="button">
              <span className="portfolio-symbol" aria-hidden="true">
                <Icon name={icon} />
              </span>
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
          <Icon name="folder" className="filter-icon" />
        </label>
        <label>
          Filter by Hub
          <select>
            <option>All hubs</option>
          </select>
          <Icon name="hub" className="filter-icon" />
        </label>
        <label>
          Filter by Cost Center
          <select>
            <option>All cost centers</option>
          </select>
          <Icon name="costCenter" className="filter-icon" />
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
          <Icon name="calendar" className="filter-icon" />
        </label>
      </div>
    </section>
  );
}
