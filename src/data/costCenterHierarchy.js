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
    costCenters: ["Camp", "CmpSB_23", "MWS_23"],
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
    region: "Kirkuk",
    hub: "BP Hub",
    costCenters: ["GRL-KR-BP-25"],
  },
  {
    region: "Basra",
    hub: "GRL_VLV",
    costCenters: ["General Valves", "ROO_VLV", "BGC_VLV", "TTL_VLV"],
  },
];

export const ALL_FILTER_VALUE = "all";

export const getUniqueFilterValues = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
