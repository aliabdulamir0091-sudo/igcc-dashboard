import { normalizeCostCenterAlias } from "./costCenterAliases";

export const COST_CENTER_HIERARCHY = [
  {
    region: "Basra",
    hub: "BGC Hub",
    costCenters: ["GRLBG_23", "ZBR_23", "KAZ_23", "UQ_23", "QTC_24", "MANPR_23", "SPAS_23", "EX_23", "BNGL-25", "NR-NGL_2025"],
  },
  {
    region: "Basra",
    hub: "ROO Hub",
    costCenters: [
      "GRLRO_23",
      "EITAR_23",
      "MPTAR_23",
      "MPMNT_23",
      "CVMNT_23",
      "EIMNT_23",
      "EISP_23",
      "MPSP_23",
      "EIESP_23",
      "PWRI_23",
      "PWRI-PWT",
      "WOD_23",
      "KBR_23",
      "E&I-MAJ_24",
      "DS-01SP_24",
      "Kiosk-25",
      "OHTL_25",
      "PWRI2_23",
      "DG02_PWD",
      "QAWPT_23",
      "MWP_23",
      "FFF_23",
      "CPSs_23",
      "FLWLN_23",
      "MITAS",
      "RTPFL_23",
      "CMSN_23",
    ],
  },
  {
    region: "Basra",
    hub: "Camp",
    costCenters: ["CmpSB_23", "MWS_23"],
  },
  {
    region: "Basra",
    hub: "Head Office",
    costCenters: ["HO_SB_23"],
  },
  {
    region: "Basra",
    hub: "Total Hub",
    costCenters: ["GRLTOT_25"],
  },
  {
    region: "Basra",
    hub: "West Qurna",
    costCenters: ["WQ1SB_23"],
  },
  {
    region: "Kirkuk",
    hub: "BP Hub",
    costCenters: ["GRL-KR-BP-25"],
  },
  {
    region: "Basra",
    hub: "Valves Hub",
    costCenters: ["GRL-VLV", "General Valves", "ROO_VLV", "BGC_VLV", "TTL_VLV"],
  },
];

export const ALL_FILTER_VALUE = "all";

export const COST_CENTER_GROUP_PREFIX = "group:";

export const BGC_SUB_HUBS = [
  {
    id: "bgc-standalone",
    label: "BGC Standalone Cost Centers",
    hub: "BGC Hub",
    costCenters: ["BNGL-25", "KAZ_23", "MANPR_23", "QTC_24", "UQ_23", "ZBR_23", "EX_23"],
  },
  {
    id: "bgc-mapped",
    label: "BGC Mapped Cost Centers",
    hub: "BGC Hub",
    costCenters: ["NR-NGL_2025", "SPAS_23"],
  },
];

export const ROO_SUB_HUBS = [
  {
    id: "roo-maint",
    label: "ROO MAINT",
    hub: "ROO Hub",
    costCenters: ["EITAR_23", "MPTAR_23", "MPMNT_23", "CVMNT_23", "EIMNT_23"],
  },
  {
    id: "roo-small-project",
    label: "ROO- Small Project",
    hub: "ROO Hub",
    costCenters: ["EISP_23", "MPSP_23", "DS-01SP_24", "DG02_PWD", "QAWPT_23", "WOD_23", "KBR_23"],
  },
  {
    id: "roo-maj-project",
    label: "ROO MAJ Project",
    hub: "ROO Hub",
    costCenters: ["E&I-MAJ_24"],
  },
  {
    id: "roo-pwri",
    label: "ROO- PWRI_23",
    hub: "ROO Hub",
    costCenters: ["PWRI-PWT", "PWRI_23"],
    filterCostCenters: ["PWRI-PWT", "PWT PWRI1_23", "PWRI_23"],
  },
  {
    id: "roo-flwln",
    label: "ROO- FLWLN",
    hub: "ROO Hub",
    costCenters: ["FLWLN_23", "RTPFL_23"],
  },
  {
    id: "roo-pwri2-ohtl",
    label: "ROO PWRI-2 and OHTL",
    hub: "ROO Hub",
    costCenters: ["PWRI2_23", "OHTL_25"],
  },
  {
    id: "roo-other-project",
    label: "Other Project",
    hub: "ROO Hub",
    costCenters: ["Kiosk-25", "MWP_23", "FFF_23", "MITAS", "CMSN_23", "EIESP_23", "CPSs_23"],
  },
];

export const COST_CENTER_GROUPS = [
  ...BGC_SUB_HUBS,
  ...ROO_SUB_HUBS,
];

export const getCostCenterGroupValue = (id) => `${COST_CENTER_GROUP_PREFIX}${id}`;

export const getCostCenterGroupByValue = (value) => {
  if (!value?.startsWith(COST_CENTER_GROUP_PREFIX)) return null;
  const id = value.slice(COST_CENTER_GROUP_PREFIX.length);
  return COST_CENTER_GROUPS.find((group) => group.id === id) || null;
};

export const getCostCenterFilterMembers = (filterValue) => {
  const group = getCostCenterGroupByValue(filterValue);
  if (group) return group.filterCostCenters || group.costCenters;
  if (!filterValue || filterValue === ALL_FILTER_VALUE) return [];
  return [filterValue];
};

export const getCostCenterFilterLabel = (filterValue) => {
  const group = getCostCenterGroupByValue(filterValue);
  if (group) return group.label;
  if (!filterValue || filterValue === ALL_FILTER_VALUE) return "";
  return filterValue;
};

export const matchesCostCenterFilter = (costCenter, filterValue) => {
  if (!filterValue || filterValue === ALL_FILTER_VALUE) return true;
  return getCostCenterFilterMembers(filterValue).map(normalizeCostCenterAlias).includes(normalizeCostCenterAlias(costCenter));
};

export const getUniqueFilterValues = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
