import { fetchAfpRecords } from "./afpRepository";
import { calculateAfpKpis } from "./afpKpis";

export async function getAfpDashboardData() {
  const records = await fetchAfpRecords();
  return {
    records,
    ...calculateAfpKpis(records),
    loadedAt: new Date().toISOString(),
  };
}
