const HEADER_ALIASES = {
  hub_unit: ["hub_unit", "hub unit", "hub", "unit"],
  wo_no: ["wo_no", "wo no", "wo number", "work order"],
  contract_no: ["contract_no", "contract no", "contract number"],
  or_number: ["or_number", "or number", "or no"],
  afp_no: ["afp_no", "afp no", "afp number", "afp"],
  description: ["description", "desc"],
  afp_percent: ["afp_percent", "afp percent", "afp %", "percent", "%"],
  submitted_date: ["submitted_date", "submitted date", "submission date"],
  submitted_value: ["submitted_value", "submitted value", "submitted amount"],
  approved_date: ["approved_date", "approved date"],
  approved_value: ["approved_value", "approved value", "approved amount"],
  status: ["status", "afp status"],
  cost_center: ["cost_center", "cost center", "cost centre"],
  period: ["period", "month", "reporting period"],
  remarks: ["remarks", "remark", "notes"],
};

const FIELD_BY_HEADER = Object.entries(HEADER_ALIASES).reduce((map, [field, aliases]) => {
  aliases.forEach((alias) => map.set(alias, field));
  return map;
}, new Map());

const normalizeHeader = (header) => String(header || "")
  .trim()
  .toLowerCase()
  .replace(/[_\-/]+/g, " ")
  .replace(/\s+/g, " ");

const cleanText = (value) => {
  const text = String(value ?? "").trim();
  return text || "";
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value)
    .trim()
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");
  if (!text) return 0;
  const normalized = text.startsWith("(") && text.endsWith(")") ? `-${text.slice(1, -1)}` : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const parseDate = (value) => {
  const text = cleanText(value);
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
};

const normalizeStatus = (record) => {
  const status = cleanText(record.status);
  if (status) return status;
  if (record.approved_value > 0 || record.approved_date) return "Approved";
  return "Pending";
};

export function parseAfpRecords(rows) {
  return rows
    .map((row, index) => {
      const mapped = Object.entries(row).reduce((record, [header, value]) => {
        const field = FIELD_BY_HEADER.get(normalizeHeader(header));
        if (field) record[field] = value;
        return record;
      }, {});

      const record = {
        row_number: index + 2,
        hub_unit: cleanText(mapped.hub_unit),
        wo_no: cleanText(mapped.wo_no),
        contract_no: cleanText(mapped.contract_no),
        or_number: cleanText(mapped.or_number),
        afp_no: cleanText(mapped.afp_no),
        description: cleanText(mapped.description),
        afp_percent: parseNumber(mapped.afp_percent),
        submitted_date: parseDate(mapped.submitted_date),
        submitted_value: parseNumber(mapped.submitted_value),
        approved_date: parseDate(mapped.approved_date),
        approved_value: parseNumber(mapped.approved_value),
        status: "",
        cost_center: cleanText(mapped.cost_center),
        period: cleanText(mapped.period),
        remarks: cleanText(mapped.remarks),
      };

      return {
        ...record,
        status: normalizeStatus(record),
      };
    })
    .filter((record) => record.afp_no || record.submitted_value || record.approved_value);
}
