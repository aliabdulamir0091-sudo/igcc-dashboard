import { fetchAfpRecords } from "./afpRepository";
import { calculateAfpKpis } from "./afpKpis";
import { isAfpRecordOnOrAfterYear } from "./afpPeriods";

const AFP_MASTER_START_YEAR = import.meta.env.VITE_AFP_MASTER_START_YEAR || "2026";

export async function getAfpDashboardData() {
  const records = (await fetchAfpRecords())
    .filter((record) => isAfpRecordOnOrAfterYear(record, AFP_MASTER_START_YEAR));
  return {
    records,
    ...calculateAfpKpis(records),
    loadedAt: new Date().toISOString(),
  };
}
