export const COST_CENTER_ALIASES = {
  GRLTOT: "GRLTOT_25",
  TOTAL_25: "GRLTOT_25",
  "OHTL _25": "OHTL_25",
  MITSOHTL: "MITAS",
  MITASOHTL: "MITAS",
  ROOP_23: "GRLRO_23",
  "PWT PWRI1_23": "PWRI-PWT",
  "E&I-MAJ": "E&I-MAJ_24",
  GRL_VLV: "GRL-VLV",
  HO_23: "HO_SB_23",
  NR_NGL25: "NR-NGL_2025",
  "NR-NGL_25": "NR-NGL_2025",
  "NR-NGL25": "NR-NGL_2025",
  GRLBG: "GRLBG_23",
  BGC_23: "GRLBG_23",
  BGCG_23: "GRLBG_23",
  camp_23: "CmpSB_23",
  ROOG_23: "GRLRO_23",
  ROOM_23: "GRLRO_23",
  GRL_KRK: "GRL-KR-BP-25",
  "Baba Gurgur": "GRL-KR-BP-25",
  "Bai Hassan": "GRL-KR-BP-25",
  QUR_23: "QTC_24",
  TMS_26: "MWP_23",
};

export const normalizeCostCenterAlias = (costCenter) => {
  const value = String(costCenter ?? "").trim();
  return COST_CENTER_ALIASES[value] || value;
};
