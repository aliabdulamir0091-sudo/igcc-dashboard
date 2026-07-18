export const COST_CENTER_ALIASES = {
  EIMNT_23: "EIMNT_23",
  GRLTOT: "GRLTOT_25",
  TOTAL_25: "GRLTOT_25",
  "Total Projects": "GRLTOT_25",
  "OHTL _25": "OHTL_25",
  MITSOHTL: "MITAS",
  MITASOHTL: "MITAS",
  ROOP_23: "GRLRO_23",
  "PWT PWRI1_23": "PWRI-PWT",
  "E&I-MAJ": "E&I-MAJ_24",
  GRL_VLV: "GRL-VLV",
  VLV_26: "GRL-VLV",
  "KIOSK-25": "Kiosk-25",
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
  BNGL_25: "BNGL-25",
  KAZ: "KAZ_23",
  KBR23: "KBR_23",
  KBR_23: "KBR_23",
  MPMNT_23: "MPMNT_23",
  PWRI_23: "PWRI_23",
  CPS_23: "CPSs_23",
  CMNT_23: "CVMNT_23",
  EPMNT_23: "EIMNT_23",
  MAINT: "EIMNT_23",
  MAINTENANCE: "EIMNT_23",
  EIMNT_24: "EIMNT_23",
  EIMNT_25: "EIMNT_23",
  "EIMNT-23": "EIMNT_23",
  "EIMNT-24": "EIMNT_23",
  "EIMNT-25": "EIMNT_23",
};

const getAliasKey = (value) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const COST_CENTER_ALIAS_LOOKUP = new Map(Object.entries(COST_CENTER_ALIASES)
  .map(([alias, canonical]) => [getAliasKey(alias), canonical]));

export const normalizeCostCenterAlias = (costCenter) => {
  const value = String(costCenter ?? "").trim();
  return COST_CENTER_ALIASES[value] || COST_CENTER_ALIAS_LOOKUP.get(getAliasKey(value)) || value;
};
