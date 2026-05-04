export function FilterRow() {
  return (
    <section className="filter-row" aria-label="Dashboard filters">
      <label>
        Portfolio
        <select>
          <option>All portfolios</option>
        </select>
      </label>
      <label>
        Hub
        <select>
          <option>All hubs</option>
        </select>
      </label>
      <label>
        Cost Center
        <select>
          <option>All cost centers</option>
        </select>
      </label>
      <label>
        Time Mode
        <select>
          <option>Month</option>
          <option>Quarter</option>
          <option>Year</option>
        </select>
      </label>
      <label>
        Period
        <select>
          <option>Select period</option>
        </select>
      </label>
      <button type="button">More Filters</button>
      <button type="button" className="ghost-button">Clear Filters</button>
    </section>
  );
}
