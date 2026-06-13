import { fetchAfpRecords } from "./afpRepository";
import { calculateAfpKpis } from "./afpKpis";
import { isAfpRecordInMasterCoverage } from "./afpPeriods";

export async function getAfpDashboardData() {
  const records = (await fetchAfpRecords())
    .filter(isAfpRecordInMasterCoverage);
  return {
    records,
    ...calculateAfpKpis(records),
    loadedAt: new Date().toISOString(),
  };
}
