import { Component, Fragment, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { read, utils } from "xlsx";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseProjectId, isFirebaseConfigured } from "./firebase";

const formatCurrency = (value) =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

const formatCompactCurrency = (value) => {
  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const divisor = absoluteValue >= 1_000_000 ? 1_000_000 : absoluteValue >= 1_000 ? 1_000 : 1;
  const suffix = absoluteValue >= 1_000_000 ? "M" : absoluteValue >= 1_000 ? "K" : "";
  const digits = divisor === 1 ? 0 : 1;

  return `${sign}$${(absoluteValue / divisor).toFixed(digits)}${suffix}`;
};

const MONTH_ORDER = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SPENT_SUMMARY_FILE = "data/spent-report/summary/monthly_summary.json";
const CREDIT_NOTE_SUMMARY_FILE = "data/spent-report/credit-note/credit_note_summary.json";
const CREDIT_NOTE_DATA_VERSION = "workshop-received-v2";
const DEFAULT_FILTERS = { portfolio: "", hub: "", costCenter: "", month: "", year: "" };
const getPublicAssetUrl = (filename) => `${import.meta.env.BASE_URL}${String(filename).split("/").map(encodeURIComponent).join("/")}`;
const IGCC_LEVEL_LABEL = "IGCC Level 1 - IRAQ GATE CONTRACTING COMPANY";
const NAV_ITEMS = [
  ["overview", "Executive Cockpit"],
  ["afp", "Commercial Approval Overview"],
  ["profitability", "Cost Center Profitability"],
];
const PERIOD_OPTIONS = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
];
const VIEW_ONLY_MODE = true;
const WELCOME_MESSAGE = "Welcome to this dashboard; Ali Abdulamir is developing this application, and this is not the final revision.";
const WELCOME_VOICE_MESSAGE = "Welcome to this dashboard. This application is developed by Ali Abdulamir, and this is not the final revision.";
const ACCESS_CACHE_MS = 12 * 60 * 60 * 1000;
const ACCESS_CACHE_PREFIX = "igcc-access";
const APPROVED_ACCESS = {
  "ali.abdulameer@igccgroup.com": "Admin",
  "ali.abdulamir0091@gmail.com": "Admin",
  "haider.almesaody@igccgroup.com": "Viewer",
  "hussein@igccgroup.com": "Viewer",
};
const COST_CATEGORY_ORDER = [
  "Accommodation",
  "Air ticket & travel",
  "Amman Expenses",
  "Charitable Contributions",
  "Communication & internet",
  "DHL / Courier Fees / Shipping",
  "Fixed Assets",
  "Fuel & Lubricant",
  "Lease & Rent",
  "Light & Heavy Equipment\u2019s Rental",
  "Material & Supplies",
  "Security",
  "Social security",
  "Staff Salary & Compensation",
  "Subcontractors",
  "Third party Manpower",
  "Third party services",
  "Visa & Traveling Expense",
];

const cleanupAmount = (raw) => {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$\s,"]+/g, "").replace(/--/g, "0");
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
};

const normalizeValue = (raw) =>
  String(raw ?? "").replace(/['"\u201C\u201D\u2018\u2019]/g, "").trim();

const normalizeHeader = (row, ...keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }

    const matchingKey = Object.keys(row).find((rowKey) => normalizeValue(rowKey).toLowerCase() === normalizeValue(key).toLowerCase());
    if (matchingKey) {
      return row[matchingKey];
    }
  }
  return "";
};

const getYearValue = (raw) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.getFullYear();
  }

  const match = String(raw ?? "").match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : null;
};

const getMonthNumber = (raw) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.getMonth() + 1;
  }

  const value = normalizeValue(raw).toLowerCase();
  if (!value) return null;

  if (MONTH_ORDER[value]) return MONTH_ORDER[value];

  const firstWord = value.split(/\s+/)[0];
  if (MONTH_ORDER[firstWord]) return MONTH_ORDER[firstWord];

  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }

  return null;
};

const getPeriodParts = (monthRaw, yearRaw) => {
  if (monthRaw instanceof Date && !Number.isNaN(monthRaw.getTime())) {
    const monthNumber = monthRaw.getMonth() + 1;
    const year = getYearValue(yearRaw) ?? monthRaw.getFullYear();

    return {
      monthNumber,
      monthName: MONTH_LABELS[monthNumber],
      quarter: Math.ceil(monthNumber / 3),
      year,
    };
  }

  const value = normalizeValue(monthRaw).toLowerCase();
  const baseYear = getYearValue(yearRaw);
  const quarterMatch = value.match(/^q([1-4])$/i);

  if (quarterMatch) {
    return {
      monthNumber: null,
      monthName: normalizeValue(monthRaw).toUpperCase(),
      quarter: Number(quarterMatch[1]),
      year: baseYear,
    };
  }

  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 12) {
    const monthNumber = ((numeric - 1) % 12) + 1;
    const yearOffset = Math.floor((numeric - 1) / 12);

    return {
      monthNumber,
      monthName: MONTH_LABELS[monthNumber],
      quarter: Math.ceil(monthNumber / 3),
      year: baseYear ? baseYear + yearOffset : null,
    };
  }

  const monthNumber = getMonthNumber(monthRaw);

  return {
    monthNumber,
    monthName: monthNumber ? MONTH_LABELS[monthNumber] : normalizeValue(monthRaw),
    quarter: monthNumber ? Math.ceil(monthNumber / 3) : null,
    year: baseYear,
  };
};

const getPeriodFromRevenueHeader = (header) => {
  const [monthRaw, yearRaw] = String(header ?? "").split("-");
  const yearNumber = Number(yearRaw);
  const fullYear = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  return getPeriodParts(monthRaw, Number.isFinite(fullYear) ? fullYear : yearRaw);
};

const COST_CENTER_GROUPS = [
  {
    label: "BGC Hub",
    centers: [
      "GRLBG_23",
      "ZBR_23",
      "KAZ_23",
      "UQ_23",
      "QTC_24",
      "MANPR_23",
      "SPAS_23",
      "EX_23",
      "BNGL-25",
      "NR-NGL_2025",
      "NR-NGL25",
    ],
  },
  {
    label: "ROO Hub",
    centers: [
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
      "CMNT_23",
    ],
  },
  {
    label: "Camp",
    centers: ["CmpSB_23", "MWS_23"],
  },
  {
    label: "Head Office",
    centers: ["HO_SB_23"],
  },
  {
    label: "Total Hub",
    centers: ["GRLTOT_25"],
  },
  {
    label: "BP Hub",
    centers: ["GRL-KR-BP-25"],
  },
  {
    label: "West Qurna Hub",
    centers: ["WQ1SB_23"],
  },
  {
    label: "Valves",
    centers: ["ROO_VLV", "BGC_VLV", "TTL_VLV", "GRL_VLV"],
  },
];

const HUB_SECTIONS = [
  {
    label: "Basra Portfolio",
    hubs: ["BGC Hub", "ROO Hub", "Camp", "Total Hub", "West Qurna Hub", "Valves"],
    accent: "#0f766e",
    soft: "rgba(15, 118, 110, 0.12)",
  },
  {
    label: "Kirkuk Portfolio",
    hubs: ["BP Hub"],
    accent: "#7c3aed",
    soft: "rgba(124, 58, 237, 0.12)",
  },
  {
    label: "Head Office",
    hubs: ["Head Office"],
    accent: "#b45309",
    soft: "rgba(180, 83, 9, 0.12)",
  },
];

const KNOWN_COST_CENTERS = new Set(COST_CENTER_GROUPS.flatMap((group) => group.centers));
const CAMP_CREDIT_NOTE_ISSUER = "CmpSB_23";
const WORKSHOP_CREDIT_NOTE_ISSUER = "MWS_23";
const CAMP_CREDIT_NOTE_CATEGORIES = new Set(["store", "fa", "fixed assets", "fixed asset", "scaffolding", "materials", "material"]);
const normalizeCreditNoteCategory = (category) =>
  String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeCostCenterKey = (costCenter) =>
  String(costCenter ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();

const getHubForCostCenter = (costCenter) => {
  const key = normalizeCostCenterKey(costCenter);
  return COST_CENTER_GROUPS.find((group) => group.centers.some((center) => normalizeCostCenterKey(center) === key))?.label ?? "Unmapped";
};

const getPortfolioForHub = (hub) =>
  HUB_SECTIONS.find((section) => section.hubs.includes(hub))?.label ?? (hub === "Unmapped" ? "Unmapped" : "Other");

const resolveHub = (item) => {
  const mappedHub = getHubForCostCenter(item?.costCenter);
  return item?.hub && item.hub !== "Unmapped" ? item.hub : mappedHub;
};

const resolvePortfolio = (item) => {
  const hub = resolveHub(item);
  const mappedPortfolio = getPortfolioForHub(hub);
  return item?.portfolio && item.portfolio !== "Unmapped" ? item.portfolio : mappedPortfolio;
};

const normalizeCreditNoteRows = (rows) =>
  rows.map((row) => {
    if (row?.sourceType !== "credit-note") return row;

    const category = normalizeCreditNoteCategory(row.category);
    const costCenter = row.costCenter;
    let cnIssued = Number(row.cnIssued) || 0;

    if (cnIssued) {
      const validCampIssue = costCenter === CAMP_CREDIT_NOTE_ISSUER && CAMP_CREDIT_NOTE_CATEGORIES.has(category);
      const validWorkshopIssue = costCenter === WORKSHOP_CREDIT_NOTE_ISSUER && category === "workshop";
      cnIssued = validCampIssue || validWorkshopIssue ? cnIssued : 0;
    }

    const cnReceived = Number(row.cnReceived) || 0;
    return { ...row, cnReceived, cnIssued, amount: cnReceived - cnIssued };
  });

// Cost center aliases for normalizing Excel data variants
const COST_CENTER_ALIASES = {
  "GRLBG": "GRLBG_23",
  "GRLTOT": "GRLTOT_25",
  "E&I-MAJ": "E&I-MAJ_24",
  "KAZ": "KAZ_23",
  "KAZ_A23": "KAZ_23",
  "UQ_A23": "UQ_23",
  "ZUBAIR_A23": "ZBR_23",
  "NR-NGL_A25": "NR-NGL_2025",
  "OHTL _25": "OHTL_25", // Extra space
  "pwri_23": "PWRI_23", // Lowercase
  "NR-NGL_25": "NR-NGL_2025",
  "BNGL_25": "BNGL-25",
  "QUR_23": "QTC_24",
  "MITSOHTL": "MITAS",
  "MITASOHTL": "MITAS",
  "ROOM_23": "CVMNT_23",
  "ROOP_23": "GRLRO_23",
  "TMS_26": "MWP_23",
  "EPMNT_23": "EIMNT_23",
  "BGC_23": "GRLBG_23",
  "BGCG_23": "GRLBG_23",
  "camp_23": "CmpSB_23",
  "Camp_23": "CmpSB_23",
  "HO_23": "HO_SB_23",
  "management": "HO_SB_23",
  "Management": "HO_SB_23",
  "MANAGEMENT": "HO_SB_23",
  "ROOG_23": "GRLRO_23",
  "TOTAL_25": "GRLTOT_25",
};

const parseSpentRows = (rows) =>
  rows
    .map((row) => {
      let costCenter = normalizeValue(
        normalizeHeader(
          row,
          "Level 2",
          "Level2",
          "level 2",
          "level2",
          "Cost Center",
          "costCenter",
          "cost_center",
          "cost center",
          "Center"
        )
      );
      costCenter = COST_CENTER_ALIASES[costCenter] || costCenter;

      const monthValue = normalizeValue(normalizeHeader(row, "Month", "month", "Billing Month", "billing_month"));
      const yearValue = normalizeValue(normalizeHeader(row, "Year", "year"));
      const { monthNumber, monthName, quarter, year } = getPeriodParts(monthValue, yearValue);
      const category = normalizeValue(normalizeHeader(row, "GL Name", "GLName", "Cost Type", "costType", "Category", "category"));
      const vendor = normalizeValue(normalizeHeader(row, "Vendor", "Supplier", "Contractor", "vendor", "supplier"));
      const amountValue = normalizeHeader(
        row,
        "Invoice Amount USD",
        "Invoice Amount",
        "InvoiceAmountUSD",
        "Invoice_Amount_USD",
        "Amount USD",
        "Amount",
        "amount",
        "Cost",
        "Total",
        "total"
      );

      return {
        costCenter,
        month: year ? `${monthName} ${year}`.trim() : monthValue,
        monthName,
        monthNumber,
        quarter,
        year,
        category,
        vendor: vendor || "Unspecified Vendor",
        amount: cleanupAmount(amountValue),
      };
    })
    .filter((item) => item.costCenter || item.month || item.amount !== 0);

const getSpentWorkbookRows = (workbook) => {
  if (workbook.Sheets.Master) {
    return utils.sheet_to_json(workbook.Sheets.Master, { defval: "" });
  }

  if (workbook.Sheets.Cost) {
    return utils.sheet_to_json(workbook.Sheets.Cost, { defval: "" });
  }

  const ignoredSheets = new Set(["summary", "sumary", "summay", "list", "data validation", "sheet1", "sheet2"]);

  return workbook.SheetNames.filter((name) => !ignoredSheets.has(name.trim().toLowerCase())).flatMap((name) =>
    utils.sheet_to_json(workbook.Sheets[name], { defval: "" })
  );
};

const parseSpentWorkbook = (workbook) => parseSpentRows(getSpentWorkbookRows(workbook));

const parseRevenueSheet = (rows, status) =>
  rows.flatMap((row) => {
    const rawCenter = normalizeValue(normalizeHeader(row, "__EMPTY", "Cost Center", "costCenter", "cost_center"));
    const costCenter = COST_CENTER_ALIASES[rawCenter] || rawCenter;

    if (!costCenter) return [];

    return Object.entries(row)
      .filter(([key]) => /^[A-Za-z]{3}-\d{2,4}$/.test(key))
      .map(([key, value]) => {
        const { monthNumber, monthName, quarter, year } = getPeriodFromRevenueHeader(key);

        return {
          costCenter,
          month: year ? `${monthName} ${year}` : key,
          monthName,
          monthNumber,
          quarter,
          year,
          status,
          amount: cleanupAmount(value),
        };
      })
      .filter((item) => item.amount !== 0);
  });

const parseRevenueWorkbook = (workbook) => {
  const submittedSheet = workbook.Sheets["Submitted AFP"];
  const approvedSheet = workbook.Sheets["Approved AFP"];

  return [
    ...(submittedSheet ? parseRevenueSheet(utils.sheet_to_json(submittedSheet, { defval: "" }), "submitted") : []),
    ...(approvedSheet ? parseRevenueSheet(utils.sheet_to_json(approvedSheet, { defval: "" }), "approved") : []),
  ];
};

function DashboardApp({ session, onLogout }) {
  const [data, setData] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [creditNoteData, setCreditNoteData] = useState([]);
  const [filename, setFilename] = useState("");
  const [revenueFilename, setRevenueFilename] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageFilters, setPageFilters] = useState({});
  const [detailCostCenter, setDetailCostCenter] = useState("KAZ_23");
  const [pagePeriodViews, setPagePeriodViews] = useState({});
  const [overviewPeriodView, setOverviewPeriodView] = useState("monthly");
  const [activePage, setActivePage] = useState("home");
  const [transactionPage, setTransactionPage] = useState(1);
  const [spentGroupBy, setSpentGroupBy] = useState("gl");
  const [selectedSpentGlNames, setSelectedSpentGlNames] = useState([]);
  const [spentSelectedGroupKey, setSpentSelectedGroupKey] = useState("");
  const [spentDetailSort, setSpentDetailSort] = useState({ field: "amount", direction: "desc" });
  const [profitabilitySortMode, setProfitabilitySortMode] = useState("worst");
  const [costViewMode, setCostViewMode] = useState("official");
  const [themeMode, setThemeMode] = useState("light");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [expandedProfitRows, setExpandedProfitRows] = useState({});
  const [spentEntryMessage, setSpentEntryMessage] = useState("");
  const [spentEntryError, setSpentEntryError] = useState("");
  const [isLoadingFullSpentDetails, setIsLoadingFullSpentDetails] = useState(false);
  const [loadedSpentDetailPeriods, setLoadedSpentDetailPeriods] = useState([]);
  const [spentImportSummary, setSpentImportSummary] = useState(null);
  const [creditNoteImportSummary, setCreditNoteImportSummary] = useState(null);
  const [isCeoPnLExpanded, setIsCeoPnLExpanded] = useState(false);
  const [activeCeoPnLFilter, setActiveCeoPnLFilter] = useState("");
  const [ceoPnLSort, setCeoPnLSort] = useState({ key: "status", direction: "asc" });
  const [collapsedCeoPnLGroups, setCollapsedCeoPnLGroups] = useState({});
  const [selectedCeoPnLRow, setSelectedCeoPnLRow] = useState(null);
  const [focusedCeoPnLIndex, setFocusedCeoPnLIndex] = useState(0);
  const [ceoViewType, setCeoViewType] = useState(session?.role === "Admin" ? "ceo" : "project");
  const [activeHeaderTool, setActiveHeaderTool] = useState("");
  const [ceoPnLColumnFilters, setCeoPnLColumnFilters] = useState({
    costCenter: "",
    submittedMin: "",
    submittedMax: "",
    approvedMin: "",
    approvedMax: "",
    cnReceivedMin: "",
    cnReceivedMax: "",
    cnIssuedMin: "",
    cnIssuedMax: "",
    totalCostMin: "",
    totalCostMax: "",
    marginMin: "",
    marginMax: "",
    netMin: "",
    netMax: "",
    status: "all",
  });
  const ceoPnLSearchRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeUserModal, setActiveUserModal] = useState("");
  const filters = pageFilters[activePage] ?? DEFAULT_FILTERS;
  const setFilters = (updater) => {
    setPageFilters((current) => {
      const currentFilters = current[activePage] ?? DEFAULT_FILTERS;
      const nextFilters = typeof updater === "function" ? updater(currentFilters) : updater;
      return { ...current, [activePage]: nextFilters };
    });
  };
  const periodView = pagePeriodViews[activePage] ?? "monthly";
  const setPeriodView = (updater) => {
    setPagePeriodViews((current) => {
      const currentView = current[activePage] ?? "monthly";
      const nextView = typeof updater === "function" ? updater(currentView) : updater;
      return { ...current, [activePage]: nextView };
    });
  };

  const theme = {
    light: {
      pageBg: "#f4f7fb",
      panelBg: "#fff",
      text: "#10233f",
      subtext: "#4a5568",
      accent: "#17324d",
      accentStrong: "#0f766e",
      accentWarm: "#b45309",
      accentSoft: "#eef3f8",
      inputBg: "#f8fafc",
      border: "#cbd5e1",
      danger: "#b00020",
      rowAlt: "#fbfbfb",
      cardShadow: "0 12px 30px rgba(15,23,42,0.08)",
    },
    dark: {
      pageBg: "#0f172a",
      panelBg: "#112240",
      text: "#e2e8f0",
      subtext: "#94a3b8",
      accent: "#60a5fa",
      accentStrong: "#34d399",
      accentWarm: "#fbbf24",
      accentSoft: "#1e293b",
      inputBg: "#0f172a",
      border: "#334155",
      danger: "#f87171",
      rowAlt: "#0f172a",
      cardShadow: "0 12px 30px rgba(15,23,42,0.35)",
    },
  }[themeMode];

  const toggleTheme = () => setThemeMode((current) => (current === "light" ? "dark" : "light"));
  const enterDashboard = () => {
    playWelcomeVoice();
    setShowWelcome(false);
  };
  const openWelcome = () => {
    window.speechSynthesis?.cancel();
    setShowWelcome(true);
  };
  const playWelcomeVoice = () => {
    if (!("speechSynthesis" in window)) return;

    const speak = () => {
      window.speechSynthesis.cancel();
      const message = new SpeechSynthesisUtterance(WELCOME_VOICE_MESSAGE);
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find((voice) => /female|zira|samantha|victoria|karen|serena|susan|aria|jenny|natural/i.test(voice.name)) ??
        voices.find((voice) => voice.lang?.toLowerCase().startsWith("en"));

      if (preferredVoice) {
        message.voice = preferredVoice;
      }

      message.rate = 0.88;
      message.pitch = 1.12;
      message.volume = 1;
      window.speechSynthesis.speak(message);
    };

    if (window.speechSynthesis.getVoices().length) {
      speak();
      return;
    }

    window.speechSynthesis.onvoiceschanged = speak;
  };

  useEffect(() => {
    if (!showWelcome || isLoading) return;

    const timer = window.setTimeout(() => {
      playWelcomeVoice();
    }, 500);

    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
    };
  }, [showWelcome, isLoading]);

  useEffect(() => {
    let isMounted = true;

    const loadSpentSummary = async () => {
      try {
        const response = await fetch(getPublicAssetUrl(SPENT_SUMMARY_FILE));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const summary = await response.json();

        if (isMounted) {
          setFilename(SPENT_SUMMARY_FILE);
          setSpentImportSummary(summary.importSummary ?? null);
        }

        return Array.isArray(summary.rows) ? summary.rows : [];
      } catch (err) {
        if (isMounted) {
          setError(`Failed to load dashboard summary data: ${err.message}`);
        }
        return [];
      }
    };

    const loadBundledRevenue = async () => {
      try {
        const response = await fetch(getPublicAssetUrl("Revenue.xlsx"));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const workbook = read(new Uint8Array(buffer), { type: "array", cellDates: true });

        if (isMounted) {
          setRevenueData(parseRevenueWorkbook(workbook));
          setRevenueFilename("Revenue.xlsx");
        }
      } catch (err) {
        if (isMounted) {
          setError(`Failed to load commercial dashboard data: ${err.message}`);
        }
      }
    };

    const loadCreditNoteSummary = async () => {
      try {
        const response = await fetch(`${getPublicAssetUrl(CREDIT_NOTE_SUMMARY_FILE)}?v=${CREDIT_NOTE_DATA_VERSION}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const summary = await response.json();

        if (isMounted) {
          setCreditNoteData(Array.isArray(summary.rows) ? normalizeCreditNoteRows(summary.rows) : []);
          setCreditNoteImportSummary(summary.importSummary ?? null);
        }
      } catch (err) {
        if (isMounted) {
          console.log(`[IGCC CN] Credit note summary not loaded: ${err.message}`);
          setCreditNoteData([]);
          setCreditNoteImportSummary(null);
        }
      }
    };

    Promise.all([loadSpentSummary(), loadBundledRevenue().then(() => []), loadCreditNoteSummary().then(() => [])])
      .then(([summaryRows]) => {
        if (!isMounted) return;

        setData(summaryRows);
      })
      .finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFilterChange = (field) => (event) => {
    setTransactionPage(1);
    setSpentSelectedGroupKey("");
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };
  const handleYearFilterChange = (event) => {
    const nextYear = event.target.value;
    setTransactionPage(1);
    setSpentSelectedGroupKey("");
    setFilters((current) => {
      const monthBelongsToYear = !current.month || !nextYear || data.some((item) => item.month === current.month && String(item.year ?? "") === nextYear);
      return {
        ...current,
        year: nextYear,
        month: monthBelongsToYear ? current.month : "",
      };
    });
  };
  const handleTimeModeChange = (value) => {
    setTransactionPage(1);
    setSpentSelectedGroupKey("");
    setPeriodView(value);
    if (value !== "monthly") {
      setFilters((current) => ({ ...current, month: "" }));
    }
  };
  const loadFullSpentDetails = async () => {
    setSpentEntryError("");
    setSpentEntryMessage("");

    const availablePeriods = spentImportSummary?.monthsDetected ?? [];
    const availablePeriodSet = new Set(availablePeriods);
    const selectedMonth = filters.month ? getMonthNumber(filters.month) : null;
    const selectedMonthYear = filters.month ? getYearValue(filters.month) : null;
    const selectedYear = filters.year ? Number(filters.year) : selectedMonthYear;
    let targetPeriods = [];

    if (selectedMonth && selectedYear) {
      const period = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
      targetPeriods = availablePeriodSet.has(period) ? [period] : [];
    } else if (selectedMonth) {
      targetPeriods = availablePeriods.filter((period) => Number(period.slice(5, 7)) === selectedMonth);
    } else if (selectedYear) {
      targetPeriods = availablePeriods.filter((period) => period.startsWith(`${selectedYear}-`));
    }

    const missingPeriods = targetPeriods.filter((period) => !loadedSpentDetailPeriods.includes(period));

    if (!filters.year && !filters.month) {
      return;
    }

    if (!targetPeriods.length) {
      const periodLabel = filters.month || filters.year || "the selected period";
      setSpentEntryMessage(`No detailed spent records are available for ${periodLabel}.`);
      return;
    }

    if (!missingPeriods.length) {
      return;
    }

    setIsLoadingFullSpentDetails(true);

    try {
      const periodPayloads = await Promise.all(missingPeriods.map(async (period) => {
        const detailFile = `spent_${period.replace("-", "_")}.json`;
        const response = await fetch(getPublicAssetUrl(`data/spent-report/processed/${detailFile}`));
        if (!response.ok) throw new Error(`${period}: HTTP ${response.status}`);
        return response.json();
      }));
      const detailRows = periodPayloads.flatMap((payload) => payload.rows ?? []);

      setData((current) => {
        const missingPeriodSet = new Set(missingPeriods);
        const retainedRows = current.filter((row) => {
          const periodKey = `${row.year ?? "Unknown"}-${String(row.monthNumber ?? 0).padStart(2, "0")}`;
          return !(row.sourceType === "summary" && missingPeriodSet.has(periodKey));
        });
        const existingIds = new Set(retainedRows.map((row) => row.id).filter(Boolean));
        const newRows = detailRows.filter((row) => !row.id || !existingIds.has(row.id));
        return [...retainedRows, ...newRows];
      });
      setLoadedSpentDetailPeriods((current) => Array.from(new Set([...current, ...missingPeriods])).sort());
    } catch (err) {
      setSpentEntryError(`Could not load full spent details: ${err.message}`);
    } finally {
      setIsLoadingFullSpentDetails(false);
    }
  };

  useEffect(() => {
    if (activePage !== "spent" || !spentImportSummary?.monthsDetected?.length) return;
    loadFullSpentDetails();
  }, [activePage, filters.year, filters.month, spentImportSummary]);

  const matchesCostFilters = (item, { includeMonth = true } = {}) => {
    const hub = resolveHub(item);
    const portfolio = resolvePortfolio(item);
    const portfolioMatch = filters.portfolio ? portfolio === filters.portfolio : true;
    const hubMatch = filters.hub ? hub === filters.hub : true;
    const costMatch = filters.costCenter ? item.costCenter === filters.costCenter : true;
    const monthMatch = includeMonth && filters.month ? item.month === filters.month : true;
    const yearMatch = filters.year ? String(item.year ?? "") === filters.year : true;
    return portfolioMatch && hubMatch && costMatch && monthMatch && yearMatch;
  };

  const matchesRevenueFilters = (item, { includeMonth = true } = {}) => {
    const hub = resolveHub(item);
    const portfolio = resolvePortfolio(item);
    const portfolioMatch = filters.portfolio ? portfolio === filters.portfolio : true;
    const hubMatch = filters.hub ? hub === filters.hub : true;
    const costMatch = filters.costCenter ? item.costCenter === filters.costCenter : true;
    const monthMatch = includeMonth && filters.month ? item.month === filters.month : true;
    const yearMatch = filters.year ? String(item.year ?? "") === filters.year : true;
    return portfolioMatch && hubMatch && costMatch && monthMatch && yearMatch;
  };

  const hasActiveGlobalFilter = Object.values(filters).some(Boolean);
  const hasCostLevelFilter = Boolean(filters.hub || filters.costCenter);
  const isAdjustedCostRequested = costViewMode === "adjusted";
  const isAdjustedCostActive = isAdjustedCostRequested && hasCostLevelFilter;
  const costViewLabel = isAdjustedCostActive ? "Adjusted Cost" : "Official Cost";
  const filteredOfficialData = data.filter((item) => matchesCostFilters(item));
  const filteredCreditNoteData = creditNoteData.filter((item) => matchesCostFilters(item));
  const creditNoteAdjustmentRows = isAdjustedCostActive
    ? filteredCreditNoteData
        .map((item) => ({
          ...item,
          amount: (Number(item.cnReceived) || 0) - (Number(item.cnIssued) || 0),
          category: item.category || "Credit Note Adjustment",
          vendor: item.vendor || "Credit Note",
          sourceType: "credit-note",
        }))
        .filter((item) => item.amount !== 0)
    : [];
  const filteredData = isAdjustedCostActive ? [...filteredOfficialData, ...creditNoteAdjustmentRows] : filteredOfficialData;
  const filteredRevenueData = revenueData.filter((item) => matchesRevenueFilters(item));
  const comparisonOfficialData = data.filter((item) => matchesCostFilters(item, { includeMonth: false }));
  const comparisonCreditNoteData = creditNoteData.filter((item) => matchesCostFilters(item, { includeMonth: false }));
  const comparisonCreditNoteAdjustmentRows = isAdjustedCostActive
    ? comparisonCreditNoteData
        .map((item) => ({
          ...item,
          amount: (Number(item.cnReceived) || 0) - (Number(item.cnIssued) || 0),
          category: item.category || "Credit Note Adjustment",
          vendor: item.vendor || "Credit Note",
          sourceType: "credit-note",
        }))
        .filter((item) => item.amount !== 0)
    : [];
  const comparisonData = isAdjustedCostActive ? [...comparisonOfficialData, ...comparisonCreditNoteAdjustmentRows] : comparisonOfficialData;
  const comparisonRevenueData = revenueData.filter((item) => matchesRevenueFilters(item, { includeMonth: false }));
  const officialVisibleTotal = filteredOfficialData.reduce((sum, d) => sum + d.amount, 0);
  const cnReceivedTotal = filteredCreditNoteData.reduce((sum, item) => sum + (Number(item.cnReceived) || 0), 0);
  const cnIssuedTotal = filteredCreditNoteData.reduce((sum, item) => sum + (Number(item.cnIssued) || 0), 0);
  const cnNetImpact = cnReceivedTotal - cnIssuedTotal;
  const adjustedCostPreviewTotal = officialVisibleTotal + cnNetImpact;
  const adjustedVisibleTotal = isAdjustedCostActive ? adjustedCostPreviewTotal : officialVisibleTotal;
  const getCreditNoteSummaryForCostCenter = (costCenter) =>
    filteredCreditNoteData
      .filter((item) => item.costCenter === costCenter)
      .reduce(
        (summary, item) => ({
          cnReceived: summary.cnReceived + (Number(item.cnReceived) || 0),
          cnIssued: summary.cnIssued + (Number(item.cnIssued) || 0),
          rows: summary.rows + 1,
        }),
        { cnReceived: 0, cnIssued: 0, rows: 0 }
      );
  const creditImpactByCenter = Array.from(
    filteredCreditNoteData
      .reduce((map, item) => {
        const key = item.costCenter || "Unmapped";
        const current = map.get(key) ?? { costCenter: key, hub: resolveHub(item), cnReceived: 0, cnIssued: 0, rows: 0 };
        current.cnReceived += Number(item.cnReceived) || 0;
        current.cnIssued += Number(item.cnIssued) || 0;
        current.rows += 1;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({ ...row, netImpact: row.cnReceived - row.cnIssued }))
    .sort((a, b) => b.cnIssued - a.cnIssued || Math.abs(b.netImpact) - Math.abs(a.netImpact));
  const creditImpactByMonth = Array.from(
    filteredCreditNoteData
      .reduce((map, item) => {
        const key = `${item.year ?? "Unknown"}-${String(item.monthNumber ?? 0).padStart(2, "0")}`;
        const current = map.get(key) ?? { key, label: item.month || key, order: (Number(item.year) || 0) * 100 + (Number(item.monthNumber) || 0), cnReceived: 0, cnIssued: 0 };
        current.cnReceived += Number(item.cnReceived) || 0;
        current.cnIssued += Number(item.cnIssued) || 0;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({ ...row, netImpact: row.cnReceived - row.cnIssued }))
    .sort((a, b) => a.order - b.order);
  const topCreditReceivingCenters = Array.from(
    filteredCreditNoteData
      .filter((item) => (Number(item.cnReceived) || 0) > 0)
      .reduce((map, item) => {
        const key = item.costCenter || "Unmapped";
        const category = normalizeCreditNoteCategory(item.category);
        const issuer = category === "workshop" ? WORKSHOP_CREDIT_NOTE_ISSUER : CAMP_CREDIT_NOTE_ISSUER;
        const current = map.get(key) ?? { costCenter: key, cnReceived: 0, sources: new Set(), rows: 0 };
        current.cnReceived += Number(item.cnReceived) || 0;
        current.sources.add(issuer);
        current.rows += 1;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({ ...row, sourceLabel: Array.from(row.sources).sort().join(" / ") }))
    .sort((a, b) => b.cnReceived - a.cnReceived)
    .slice(0, 8);
  const maxTopCreditReceived = Math.max(...topCreditReceivingCenters.map((row) => row.cnReceived), 0);

  const sortedData = [...filteredData].sort((a, b) => b.amount - a.amount);
  const spentHasActiveFilter = Boolean(filters.portfolio || filters.hub || filters.costCenter || filters.year || filters.month);
  const spentPortfolioSummary = HUB_SECTIONS.map((section) => section.label).map((portfolio) => {
    const rows = data.filter((item) => {
      const rowPortfolio = resolvePortfolio(item);
      return rowPortfolio === portfolio;
    });
    const amount = rows.reduce((sum, item) => sum + item.amount, 0);
    const costCenters = new Set(rows.map((item) => item.costCenter).filter(Boolean)).size;
    const hubs = new Set(rows.map((item) => resolveHub(item)).filter(Boolean)).size;
    return { portfolio, amount, rows: rows.length, costCenters, hubs };
  }).filter((row) => row.rows > 0);
  const spentGroupOptions = [
    ["gl", "GL Name"],
    ["costCenter", "Cost Center"],
    ["portfolioHub", "Portfolio / Hub"],
    ["month", "Month"],
  ];
  const getSpentGroupInfo = (item, groupBy = spentGroupBy) => {
    const portfolio = resolvePortfolio(item) || "Unmapped";
    const hub = resolveHub(item) || "Unmapped";
    if (groupBy === "costCenter") {
      const label = item.costCenter || "Unmapped Cost Center";
      return { key: label, label, sublabel: `${portfolio} / ${hub}` };
    }
    if (groupBy === "portfolioHub") {
      return { key: `${portfolio}|${hub}`, label: hub, sublabel: portfolio };
    }
    if (groupBy === "month") {
      const monthNumber = Number(item.monthNumber) || 0;
      const year = item.year || "Unknown";
      return { key: `${year}-${String(monthNumber).padStart(2, "0")}`, label: item.month || "Unknown Month", sublabel: `${item.rows ?? 1} record${(item.rows ?? 1) === 1 ? "" : "s"}` };
    }
    const label = item.category || "Uncategorized";
    return { key: label.toLowerCase(), label, sublabel: "GL cost driver" };
  };
  const spentGroupedRows = Array.from(
    filteredData.reduce((map, item) => {
      const info = getSpentGroupInfo(item, spentGroupBy);
      const current = map.get(info.key) ?? {
        ...info,
        amount: 0,
        rows: 0,
        costCenters: new Set(),
        months: new Set(),
        portfolios: new Set(),
        hubs: new Set(),
      };
      current.amount += Number(item.amount) || 0;
      current.rows += Number(item.rows) || 1;
      current.costCenters.add(item.costCenter);
      current.months.add(item.month);
      current.portfolios.add(resolvePortfolio(item));
      current.hubs.add(resolveHub(item));
      map.set(info.key, current);
      return map;
    }, new Map()).values()
  )
    .map((row) => ({
      ...row,
      costCenterCount: Array.from(row.costCenters).filter(Boolean).length,
      monthCount: Array.from(row.months).filter(Boolean).length,
      portfolioCount: Array.from(row.portfolios).filter(Boolean).length,
      hubCount: Array.from(row.hubs).filter(Boolean).length,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const spentTotalAmount = filteredData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const spentMonthCount = new Set(filteredData.map((item) => item.month).filter(Boolean)).size;
  const topSpentGl = Array.from(
    filteredData.reduce((map, item) => {
      const label = item.category || "Uncategorized";
      map.set(label, (map.get(label) || 0) + (Number(item.amount) || 0));
      return map;
    }, new Map()).entries()
  ).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const topSpentCostCenter = Array.from(
    filteredData.reduce((map, item) => {
      const label = item.costCenter || "Unmapped";
      map.set(label, (map.get(label) || 0) + (Number(item.amount) || 0));
      return map;
    }, new Map()).entries()
  ).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const maxSpentGroupAmount = Math.max(...spentGroupedRows.map((row) => Math.abs(row.amount)), 0);
  const spentGlOptions = Array.from(new Set(filteredData.map((item) => item.category || "Uncategorized").filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const selectedSpentGlSet = new Set(selectedSpentGlNames);
  const spentGlFilteredRows = selectedSpentGlNames.length
    ? filteredData.filter((item) => selectedSpentGlSet.has(item.category || "Uncategorized"))
    : filteredData;
  const costCenterCostTotals = filteredData.reduce((map, item) => {
    const center = item.costCenter || "Unmapped";
    map.set(center, (map.get(center) || 0) + (Number(item.amount) || 0));
    return map;
  }, new Map());
  const costCenterApprovedTotals = filteredRevenueData
    .filter((item) => item.status === "approved")
    .reduce((map, item) => {
      const center = item.costCenter || "Unmapped";
      map.set(center, (map.get(center) || 0) + (Number(item.amount) || 0));
      return map;
    }, new Map());
  const spentGlComparisonRows = Array.from(
    spentGlFilteredRows
      .reduce((map, item) => {
        const center = item.costCenter || "Unmapped";
        const glName = item.category || "Uncategorized";
        const key = `${center}|${glName}`;
        const current = map.get(key) ?? { costCenter: center, glName, amount: 0, rows: 0 };
        current.amount += Number(item.amount) || 0;
        current.rows += Number(item.rows) || 1;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({
      ...row,
      costShare: costCenterCostTotals.get(row.costCenter) ? row.amount / costCenterCostTotals.get(row.costCenter) : 0,
      revenueShare: costCenterApprovedTotals.get(row.costCenter) ? row.amount / costCenterApprovedTotals.get(row.costCenter) : null,
    }))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter) || Math.abs(b.amount) - Math.abs(a.amount));
  const maxSpentGlComparisonAmount = Math.max(...spentGlComparisonRows.map((row) => Math.abs(row.amount)), 0);
  const spentGlComparisonByCenter = Array.from(
    spentGlComparisonRows
      .reduce((map, row) => {
        const current = map.get(row.costCenter) ?? {
          costCenter: row.costCenter,
          total: 0,
          costTotal: costCenterCostTotals.get(row.costCenter) || 0,
          approvedTotal: costCenterApprovedTotals.get(row.costCenter) || 0,
          glRows: [],
        };
        current.total += Number(row.amount) || 0;
        current.glRows.push(row);
        map.set(row.costCenter, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const maxSpentGlCenterTotal = Math.max(...spentGlComparisonByCenter.map((row) => Math.abs(row.total)), 0);
  const spentGlPalette = ["#0f766e", "#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#b45309"];
  const getSpentGlColor = (glName) => {
    const index = Math.max(0, selectedSpentGlNames.indexOf(glName));
    return spentGlPalette[index % spentGlPalette.length];
  };
  const isSpentGlComparisonActive = spentGroupBy === "gl" && selectedSpentGlNames.length > 0;
  const selectedSpentGroup = spentGroupedRows.find((row) => row.key === spentSelectedGroupKey);
  const spentSelectedRows = selectedSpentGroup
    ? filteredData.filter((item) => getSpentGroupInfo(item, spentGroupBy).key === selectedSpentGroup.key)
    : [];
  const getSpentSortValue = (row, field) => {
    if (field === "portfolio") return resolvePortfolio(row) || "";
    if (field === "hub") return resolveHub(row) || "";
    if (field === "costCenter") return row.costCenter || "";
    if (field === "month") return (Number(row.year) || 0) * 100 + (Number(row.monthNumber) || 0);
    if (field === "category") return row.category || "";
    if (field === "vendor") return row.vendor || "";
    return Number(row.amount) || 0;
  };
  const spentDetailRows = [...spentSelectedRows].sort((a, b) => {
    const aValue = getSpentSortValue(a, spentDetailSort.field);
    const bValue = getSpentSortValue(b, spentDetailSort.field);
    const compare = typeof aValue === "number" && typeof bValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue));
    return spentDetailSort.direction === "asc" ? compare : -compare;
  });
  const spentDetailPageSize = 50;
  const spentDetailPageCount = Math.max(1, Math.ceil(spentDetailRows.length / spentDetailPageSize));
  const safeSpentDetailPage = Math.min(transactionPage, spentDetailPageCount);
  const pagedSpentDetailRows = spentDetailRows.slice((safeSpentDetailPage - 1) * spentDetailPageSize, safeSpentDetailPage * spentDetailPageSize);
  const handleSpentGroupChange = (groupBy) => {
    setSpentGroupBy(groupBy);
    setSpentSelectedGroupKey("");
    setTransactionPage(1);
  };
  const toggleSpentGlSelection = (glName) => {
    setSpentSelectedGroupKey("");
    setTransactionPage(1);
    setSelectedSpentGlNames((current) => {
      const next = current.includes(glName)
        ? current.filter((item) => item !== glName)
        : [...current, glName].sort((a, b) => a.localeCompare(b));
      return next;
    });
  };
  const clearSpentGlSelection = () => {
    setSelectedSpentGlNames([]);
    setSpentSelectedGroupKey("");
    setTransactionPage(1);
  };
  const handleSpentDetailSort = (field) => {
    setTransactionPage(1);
    setSpentDetailSort((current) => ({
      field,
      direction: current.field === field && current.direction === "desc" ? "asc" : "desc",
    }));
  };
  const transactionPageSize = 100;
  const transactionPageCount = Math.max(1, Math.ceil(sortedData.length / transactionPageSize));
  const safeTransactionPage = Math.min(transactionPage, transactionPageCount);
  const pagedTransactionRows = sortedData.slice((safeTransactionPage - 1) * transactionPageSize, safeTransactionPage * transactionPageSize);
  const sortBy = "amount";
  const sortAsc = false;
  const visibleRows = [];
  const safePage = 1;
  const toggleSort = () => {};

  const getPeriodBucket = (item, view) => {
    const year = item.year ?? "Unknown";
    const quarter = item.quarter ?? "Unknown";
    const monthNumber = item.monthNumber ?? 0;
    const monthName = item.monthName || "Unknown";
    let key = String(year);
    let label = String(year);
    let order = Number(year) * 100;

    if (view === "monthly") {
      key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      label = year === "Unknown" ? monthName : `${monthName} ${year}`;
      order = (Number(year) || 0) * 100 + monthNumber;
    }

    if (view === "quarterly") {
      key = `${year}-Q${quarter}`;
      label = quarter === "Unknown" ? String(year) : year === "Unknown" ? `Q${quarter}` : `Q${quarter} ${year}`;
      order = (Number(year) || 0) * 100 + (Number(quarter) || 0) * 3;
    }

    return { key, label, order };
  };

  const aggregateByPeriod = (rows, view) => {
    const bucketMap = new Map();

    rows.forEach((item) => {
      const { key, label, order } = getPeriodBucket(item, view);

      const current = bucketMap.get(key) ?? { key, label, amount: 0, rows: 0, order };
      current.amount += item.amount;
      current.rows += 1;
      bucketMap.set(key, current);
    });

    return Array.from(bucketMap.values()).sort((a, b) => a.order - b.order);
  };

  const periodTotals = aggregateByPeriod(filteredData, periodView);
  const maxPeriodAmount = Math.max(...periodTotals.map((item) => Math.abs(item.amount)), 0);
  const visibleTotal = filteredData.reduce((sum, d) => sum + d.amount, 0);
  const submittedRevenue = filteredRevenueData
    .filter((item) => item.status === "submitted")
    .reduce((sum, item) => sum + item.amount, 0);
  const approvedRevenue = filteredRevenueData
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + item.amount, 0);
  const approvalGap = submittedRevenue - approvedRevenue;
  const revenueSurplus = approvedRevenue - visibleTotal;
  const recoveryRatio = visibleTotal ? approvedRevenue / visibleTotal : 0;
  const groupedCenterSet = new Set(COST_CENTER_GROUPS.flatMap((group) => group.centers));
  const unmappedRevenueCenters = Array.from(
    new Set(filteredRevenueData.map((item) => item.costCenter).filter((center) => center && !groupedCenterSet.has(center)))
  ).sort();
  const hubSourceGroups = unmappedRevenueCenters.length
    ? [...COST_CENTER_GROUPS, { label: "Unmapped Revenue", centers: unmappedRevenueCenters }]
    : COST_CENTER_GROUPS;

  const hubCostCenterBreakdown = hubSourceGroups.map((group) => {
    const centers = group.centers
      .map((center) => {
        const centerRows = filteredData.filter((item) => item.costCenter === center);
        const centerRevenueRows = filteredRevenueData.filter((item) => item.costCenter === center);
        const submitted = centerRevenueRows
          .filter((item) => item.status === "submitted")
          .reduce((sum, item) => sum + item.amount, 0);
        const approved = centerRevenueRows
          .filter((item) => item.status === "approved")
          .reduce((sum, item) => sum + item.amount, 0);

        return {
          center,
          amount: centerRows.reduce((sum, item) => sum + item.amount, 0),
          rows: centerRows.length,
          submitted,
          approved,
        };
      })
      .filter((center) => center.rows > 0 || center.submitted !== 0 || center.approved !== 0 || (!filters.costCenter && !filters.month && !filters.year))
      .sort((a, b) => b.amount - a.amount);

    return {
      label: group.label,
      centers,
      amount: centers.reduce((sum, center) => sum + center.amount, 0),
      rows: centers.reduce((sum, center) => sum + center.rows, 0),
      submitted: centers.reduce((sum, center) => sum + center.submitted, 0),
      approved: centers.reduce((sum, center) => sum + center.approved, 0),
    };
  });
  const hubBreakdownBySection = HUB_SECTIONS.map((section) => ({
    ...section,
    hubs: section.hubs.map((hub) => hubCostCenterBreakdown.find((group) => group.label === hub)).filter(Boolean),
  })).filter((section) => section.hubs.length > 0);
  const portfolioSummaries = hubBreakdownBySection.map((section) => {
    const cost = section.hubs.reduce((sum, hub) => sum + hub.amount, 0);
    const submitted = section.hubs.reduce((sum, hub) => sum + hub.submitted, 0);
    const approved = section.hubs.reduce((sum, hub) => sum + hub.approved, 0);
    const rows = section.hubs.reduce((sum, hub) => sum + hub.rows, 0);

    return {
      label: section.label,
      accent: section.accent,
      soft: section.soft,
      hubCount: section.hubs.length,
      cost,
      submitted,
      approved,
      rows,
      profit: approved - cost,
      recovery: cost ? approved / cost : 0,
    };
  });
  const performanceRows = hubSourceGroups
    .flatMap((hub) =>
      hub.centers.flatMap((center) => {
        const periodMap = new Map();
        const ensurePeriod = (item) => {
          const period = getPeriodBucket(item, periodView);
          const key = `${center}-${period.key}`;
          const current = periodMap.get(key) ?? {
            hub: hub.label,
            center,
            period: period.label,
            periodOrder: period.order,
            cost: 0,
            submitted: 0,
            approved: 0,
            rows: 0,
          };
          periodMap.set(key, current);
          return current;
        };

        filteredData
          .filter((item) => item.costCenter === center)
          .forEach((item) => {
            const current = ensurePeriod(item);
            current.cost += item.amount;
            current.rows += 1;
          });

        filteredRevenueData
          .filter((item) => item.costCenter === center)
          .forEach((item) => {
            const current = ensurePeriod(item);
            if (item.status === "submitted") current.submitted += item.amount;
            if (item.status === "approved") current.approved += item.amount;
          });

        return Array.from(periodMap.values()).map((row) => ({
          ...row,
          profit: row.approved - row.cost,
          recovery: row.cost ? row.approved / row.cost : 0,
        }));
      })
    )
    .filter((row) => row.cost || row.submitted || row.approved)
    .sort((a, b) => b.periodOrder - a.periodOrder || b.cost - a.cost);

  const hubPerformanceRows = hubSourceGroups
    .flatMap((hub) => {
      const periodMap = new Map();
      const ensurePeriod = (item) => {
        const period = getPeriodBucket(item, periodView);
        const current = periodMap.get(period.key) ?? {
          hub: hub.label,
          period: period.label,
          periodOrder: period.order,
          cost: 0,
          submitted: 0,
          approved: 0,
          rows: 0,
        };
        periodMap.set(period.key, current);
        return current;
      };

      filteredData
        .filter((item) => hub.centers.includes(item.costCenter))
        .forEach((item) => {
          const current = ensurePeriod(item);
          current.cost += item.amount;
          current.rows += 1;
        });

      filteredRevenueData
        .filter((item) => hub.centers.includes(item.costCenter))
        .forEach((item) => {
          const current = ensurePeriod(item);
          if (item.status === "submitted") current.submitted += item.amount;
          if (item.status === "approved") current.approved += item.amount;
        });

      return Array.from(periodMap.values()).map((row) => ({
        ...row,
        profit: row.approved - row.cost,
        recovery: row.cost ? row.approved / row.cost : 0,
      }));
    })
    .filter((row) => row.cost || row.submitted || row.approved)
    .sort((a, b) => b.periodOrder - a.periodOrder || b.cost - a.cost);
  const performanceByPortfolio = HUB_SECTIONS.map((section) => {
    const hubRows = hubPerformanceRows.filter((row) => section.hubs.includes(row.hub));
    const centerRows = performanceRows.filter((row) => section.hubs.includes(row.hub));
    return { ...section, hubRows, centerRows };
  }).filter((section) => section.hubRows.length || section.centerRows.length);

  const incomeStatementRows = periodTotals.map((period) => {
    const revenueRows = filteredRevenueData.filter((item) => {
      if (periodView === "yearly") return String(item.year ?? "Unknown") === period.key;
      if (periodView === "quarterly") return `${item.year ?? "Unknown"}-Q${item.quarter ?? "Unknown"}` === period.key;
      return `${item.year ?? "Unknown"}-${String(item.monthNumber ?? 0).padStart(2, "0")}` === period.key;
    });
    const submitted = revenueRows
      .filter((item) => item.status === "submitted")
      .reduce((sum, item) => sum + item.amount, 0);
    const approved = revenueRows
      .filter((item) => item.status === "approved")
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      label: period.label,
      submitted,
      approved,
      cost: period.amount,
      approvalGap: submitted - approved,
      grossProfit: approved - period.amount,
      margin: approved ? (approved - period.amount) / approved : 0,
      recovery: period.amount ? approved / period.amount : 0,
    };
  });
  const detailFilteredCostRows = data.filter((item) => {
    const centerMatch = item.costCenter === detailCostCenter;
    const monthMatch = filters.month ? item.month.toLowerCase().includes(filters.month.toLowerCase()) : true;
    return centerMatch && monthMatch;
  });
  const detailFilteredRevenueRows = revenueData.filter((item) => {
    const centerMatch = item.costCenter === detailCostCenter;
    const monthMatch = filters.month ? item.month.toLowerCase().includes(filters.month.toLowerCase()) : true;
    return centerMatch && monthMatch;
  });
  const detailSubmittedRevenue = detailFilteredRevenueRows
    .filter((item) => item.status === "submitted")
    .reduce((sum, item) => sum + item.amount, 0);
  const detailApprovedRevenue = detailFilteredRevenueRows
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + item.amount, 0);
  const detailCostTotal = detailFilteredCostRows.reduce((sum, item) => sum + item.amount, 0);
  const detailProfit = detailApprovedRevenue - detailCostTotal;
  const detailMergedSources = [detailCostCenter, ...Object.entries(COST_CENTER_ALIASES).filter(([, target]) => target === detailCostCenter).map(([source]) => source)]
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .sort();
  const detailGlRows = Array.from(
    detailFilteredCostRows
      .reduce((map, item) => {
        const glName = item.category || "Uncategorized";
        const key = normalizeValue(glName).toLowerCase() || "uncategorized";
        const current = map.get(key) ?? { glName, amount: 0, rows: 0 };
        current.amount += item.amount;
        current.rows += 1;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => a.glName.localeCompare(b.glName));
  const detailMaxGlAmount = Math.max(...detailGlRows.map((row) => Math.abs(row.amount)), 0);

  const unknownCostCenters = Array.from(
    new Set(
      data
        .map((item) => item.costCenter)
        .filter((name) => name && !KNOWN_COST_CENTERS.has(name))
    )
  );

  const exportCSV = () => {
    if (!sortedData.length) return;

    const csv = Papa.unparse(
      sortedData.map((row) => ({
        "Cost Center": row.costCenter,
        Month: row.month,
        Amount: row.amount,
      }))
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename ? `${filename.replace(/\.[^/.]+$/, "")}-export.csv` : "cost-dashboard-export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFilename(file.name);
    setError("");

    const extension = file.name.toLowerCase().split(".").pop();

    if (extension === "xlsx" || extension === "xls") {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = read(data, { type: "array", cellDates: true });
          setData(parseSpentWorkbook(workbook));
        } catch (err) {
          setError(`Failed to parse Excel file: ${err.message}`);
          setData([]);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setError(`CSV parse error: ${results.errors[0].message}`);
            setData([]);
            return;
          }

          setData(parseSpentRows(results.data));
        },
        error: (err) => {
          setError(`Failed to read file: ${err.message}`);
          setData([]);
        },
      });
    }
  };

  const yearsLoaded = Array.from(new Set(data.map((item) => item.year).filter(Boolean))).sort((a, b) => a - b);
  const monthOptions = Array.from(
    data
      .reduce((map, item) => {
        if (!item.month) return map;
        const order = (Number(item.year) || 0) * 100 + (Number(item.monthNumber) || 0);
        const current = map.get(item.month);
        if (!current || order < current.order) {
          map.set(item.month, { label: item.month, order });
        }
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  const filteredMonthOptions = filters.year
    ? monthOptions.filter((month) => data.some((item) => item.month === month.label && String(item.year ?? "") === filters.year))
    : monthOptions;
  const glNameOptions = Array.from(new Set([...COST_CATEGORY_ORDER, ...data.map((item) => item.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b));
  const portfolioOptions = HUB_SECTIONS.map((section) => section.label);
  const hubOptions = COST_CENTER_GROUPS.map((group) => group.label);
  const filteredHubOptions = filters.portfolio
    ? hubOptions.filter((hub) => getPortfolioForHub(hub) === filters.portfolio)
    : hubOptions;
  const filteredCostCenterOptions = COST_CENTER_GROUPS
    .filter((group) => (filters.portfolio ? getPortfolioForHub(group.label) === filters.portfolio : true))
    .filter((group) => (filters.hub ? group.label === filters.hub : true))
    .flatMap((group) => group.centers);
  const panelStyle = { marginBottom: 24, backgroundColor: theme.panelBg, padding: 18, borderRadius: 8, border: `1px solid ${theme.border}`, boxShadow: theme.cardShadow };
  const tableHeaderStyle = { border: `1px solid ${theme.border}`, padding: 10, textAlign: "right", background: theme.accentSoft, color: theme.text };
  const tableCellStyle = { border: `1px solid ${theme.border}`, padding: 10, textAlign: "right", color: theme.text };
  const leftHeaderStyle = { ...tableHeaderStyle, textAlign: "left" };
  const leftCellStyle = { ...tableCellStyle, textAlign: "left", fontWeight: 700 };
  const profitColor = (value) => (value >= 0 ? theme.accentStrong : theme.danger);
  const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
  const renderPeriodToggleFor = (value, onChange) => (
    <div onClick={(event) => event.stopPropagation()} style={{ display: "flex", width: "100%", boxSizing: "border-box", gap: 3, padding: 3, background: theme.accentSoft, borderRadius: 8, overflow: "hidden" }}>
      {PERIOD_OPTIONS.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          style={{
            border: "none",
            borderRadius: 6,
            flex: "1 1 0",
            minWidth: 0,
            padding: "8px 7px",
            cursor: "pointer",
            fontWeight: 850,
            fontSize: 11,
            whiteSpace: "nowrap",
            background: value === optionValue ? theme.panelBg : "transparent",
            color: value === optionValue ? theme.accentStrong : theme.text,
            boxShadow: value === optionValue ? "0 1px 4px rgba(15,23,42,0.12)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const renderPeriodToggle = () => (
    renderPeriodToggleFor(periodView, setPeriodView)
  );
  const renderCostViewToggle = () => (
    <div style={{ display: "grid", gap: 6, minWidth: "min(100%, 280px)" }}>
      <div onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: 3, padding: 3, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        {[
          ["official", "Official Cost"],
          ["adjusted", "Adjusted Cost"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCostViewMode(value)}
            style={{ border: "none", borderRadius: 6, flex: "1 1 0", minWidth: 0, padding: "8px 9px", cursor: "pointer", fontWeight: 900, fontSize: 11, background: costViewMode === value ? theme.panelBg : "transparent", color: costViewMode === value ? theme.accentStrong : theme.text, boxShadow: costViewMode === value ? "0 1px 4px rgba(15,23,42,0.12)" : "none" }}
          >
            {label}
          </button>
        ))}
      </div>
      <span style={{ color: theme.subtext, fontSize: 11, lineHeight: 1.35 }}>
        {isAdjustedCostActive ? "CN applied at hub / cost center level." : isAdjustedCostRequested ? "IGCC Level 1 remains Official Cost until a hub or cost center is selected." : "Spent Report only."}
      </span>
    </div>
  );
  const renderWorkshopCreditImpact = () => {
    const maxMonthImpact = Math.max(...creditImpactByMonth.map((row) => Math.abs(row.netImpact)), 0);

    return (
      <section style={{ marginTop: 16, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Credit Note Reallocation</h3>
            <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Store, FA, Scaffolding, and Materials issue from CmpSB_23; Workshop issues from MWS_23.</p>
          </div>
          <span style={{ color: theme.subtext, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>
            {creditNoteImportSummary?.totalFiles ?? 0} CN files
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            ["Total CN Issued", formatCurrency(cnIssuedTotal), "Credits reducing adjusted cost", theme.danger],
            ["Total CN Received", formatCurrency(cnReceivedTotal), "Explicit received CN columns", theme.accentStrong],
            ["Net CN Impact", formatCurrency(cnNetImpact), "Received minus issued", cnNetImpact >= 0 ? theme.accentStrong : theme.danger],
          ].map(([label, value, detail, accent]) => (
            <div key={label} style={{ border: `1px solid ${theme.border}`, borderLeft: `4px solid ${accent}`, borderRadius: 8, padding: 13, background: theme.panelBg }}>
              <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
              <div style={{ marginTop: 7, color: accent, fontSize: 20, lineHeight: 1.05, fontWeight: 950 }}>{value}</div>
              <div style={{ marginTop: 7, color: theme.subtext, fontSize: 12 }}>{detail}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 320px), 1fr) minmax(min(100%, 320px), 1fr)", gap: 14, marginTop: 14 }}>
          <div>
            <h4 style={{ margin: "0 0 10px", color: theme.text, fontSize: 14 }}>Top receiving cost centers</h4>
            <div style={{ display: "grid", gap: 8 }}>
              {[...creditImpactByCenter].sort((a, b) => b.cnReceived - a.cnReceived || Math.abs(b.netImpact) - Math.abs(a.netImpact)).slice(0, 6).map((row) => (
                <div key={row.costCenter} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 130px", gap: 10, alignItems: "center" }}>
                  <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, overflowWrap: "anywhere" }}>{row.costCenter}</span>
                  <span style={{ color: theme.accentStrong, textAlign: "right", fontSize: 12, fontWeight: 950 }}>{formatCompactCurrency(row.cnReceived)}</span>
                </div>
              ))}
              {!creditImpactByCenter.length && <div style={{ color: theme.subtext, fontSize: 12 }}>No CN rows match the current filters.</div>}
            </div>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", color: theme.text, fontSize: 14 }}>CN impact by month</h4>
            <div style={{ display: "grid", gap: 8 }}>
              {creditImpactByMonth.slice(-8).map((row) => {
                const width = `${Math.max(4, (Math.abs(row.netImpact) / (maxMonthImpact || 1)) * 100)}%`;
                return (
                  <div key={row.key} style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr) 120px", gap: 8, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{row.label}</span>
                    <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width, height: "100%", borderRadius: 999, background: row.netImpact >= 0 ? theme.accentStrong : theme.danger }} />
                    </div>
                    <span style={{ color: row.netImpact >= 0 ? theme.accentStrong : theme.danger, textAlign: "right", fontSize: 12, fontWeight: 900 }}>{formatCompactCurrency(row.netImpact)}</span>
                  </div>
                );
              })}
              {!creditImpactByMonth.length && <div style={{ color: theme.subtext, fontSize: 12 }}>No monthly CN impact for the current filters.</div>}
            </div>
          </div>
        </div>
      </section>
    );
  };
  const renderCostSourceBreakdown = () => {
    if (!hasCostLevelFilter) return null;

    const title = filters.costCenter
      ? `${filters.costCenter} Cost Source Breakdown`
      : filters.hub
        ? `${filters.hub} Cost Source Breakdown`
        : `${filters.portfolio} Cost Source Breakdown`;
    const sourceRows = [
      ["Spent Report Cost", officialVisibleTotal, "Official cost from Spent Report only", theme.accentWarm],
      ["CN Received", cnReceivedTotal, "Credit notes received", theme.accentStrong],
      ["CN Issued", cnIssuedTotal, "Credit notes issued", theme.danger],
      ["Adjusted Cost", adjustedCostPreviewTotal, "Spent + CN Received - CN Issued", adjustedCostPreviewTotal >= officialVisibleTotal ? theme.accentWarm : theme.accentStrong],
    ];

    return (
      <section style={{ marginTop: 16, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>{title}</h3>
            <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Official cost is kept separate from Credit Note impact.</p>
          </div>
          <span style={{ color: isAdjustedCostActive ? theme.accentStrong : theme.subtext, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>
            Current view: {costViewLabel}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {sourceRows.map(([label, value, detail, accent]) => (
            <div key={label} style={{ border: `1px solid ${theme.border}`, borderTop: `4px solid ${accent}`, borderRadius: 8, padding: 13, background: theme.panelBg }}>
              <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
              <div style={{ marginTop: 7, color: accent, fontSize: 20, lineHeight: 1.05, fontWeight: 950 }}>{formatCurrency(value)}</div>
              <div style={{ marginTop: 7, color: theme.subtext, fontSize: 12 }}>{detail}</div>
            </div>
          ))}
        </div>
        {filters.costCenter && (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Source</th>
                  <th style={leftHeaderStyle}>Cost Center</th>
                  <th style={tableHeaderStyle}>Amount</th>
                  <th style={leftHeaderStyle}>Effect</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={leftCellStyle}>Spent Report</td>
                  <td style={leftCellStyle}>{filters.costCenter}</td>
                  <td style={tableCellStyle}>{formatCurrency(officialVisibleTotal)}</td>
                  <td style={leftCellStyle}>Official cost base</td>
                </tr>
                <tr>
                  <td style={leftCellStyle}>Credit Note Received</td>
                  <td style={leftCellStyle}>{filters.costCenter}</td>
                  <td style={{ ...tableCellStyle, color: theme.accentStrong }}>{formatCurrency(cnReceivedTotal)}</td>
                  <td style={leftCellStyle}>Adds to adjusted cost</td>
                </tr>
                <tr>
                  <td style={leftCellStyle}>Credit Note Issued</td>
                  <td style={leftCellStyle}>{filters.costCenter}</td>
                  <td style={{ ...tableCellStyle, color: theme.danger }}>{formatCurrency(cnIssuedTotal)}</td>
                  <td style={leftCellStyle}>Reduces adjusted cost</td>
                </tr>
                <tr style={{ background: theme.accentSoft }}>
                  <td style={leftCellStyle}>Adjusted Cost</td>
                  <td style={leftCellStyle}>{filters.costCenter}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 950 }}>{formatCurrency(adjustedCostPreviewTotal)}</td>
                  <td style={leftCellStyle}>Spent + received - issued</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };
  const overviewPeriodTotals = aggregateByPeriod(filteredData, overviewPeriodView);
  const chartPeriods = overviewPeriodTotals.slice(-8);
  const maxChartPeriodAmount = Math.max(...chartPeriods.map((item) => Math.abs(item.amount)), 0);
  const centerSummaryRows = hubCostCenterBreakdown
    .flatMap((hub) =>
      hub.centers.map((center) => {
        const cnSummary = getCreditNoteSummaryForCostCenter(center.center);
        const grossCost = filteredOfficialData.filter((item) => item.costCenter === center.center).reduce((sum, item) => sum + item.amount, 0);
        const adjustedCost = grossCost + (isAdjustedCostActive ? cnSummary.cnReceived - cnSummary.cnIssued : 0);

        return {
          portfolio: getPortfolioForHub(hub.label),
          hub: hub.label,
          costCenter: center.center,
          grossCost,
          cnReceived: cnSummary.cnReceived,
          cnIssued: cnSummary.cnIssued,
          adjustedCost,
          cost: center.amount,
          submitted: center.submitted,
          approved: center.approved,
          gap: center.submitted - center.approved,
          net: center.approved - center.amount,
          margin: center.approved ? (center.approved - center.amount) / center.approved : center.amount ? -1 : 0,
          rows: center.rows,
        };
      })
    )
    .filter((row) => row.cost || row.submitted || row.approved)
    .sort((a, b) => b.cost - a.cost);
  const getCostCenterMarginSparkline = (costCenter, width = 64, height = 22, padding = 3) => {
    const costRows = (filters.month ? filteredData : comparisonData).filter((item) => item.costCenter === costCenter);
    const revenueRows = (filters.month ? filteredRevenueData : comparisonRevenueData).filter((item) => item.costCenter === costCenter);
    const bucketMap = new Map();

    [...costRows, ...revenueRows].forEach((item) => {
      const bucket = getPeriodBucket(item, "monthly");
      if (bucket.key !== "Unknown") bucketMap.set(bucket.key, bucket);
    });

    const buckets = Array.from(bucketMap.values()).sort((a, b) => a.order - b.order).slice(-6);
    if (!buckets.length) return { points: "", color: theme.subtext };

    const values = buckets.map((bucket) => {
      const cost = costRows
        .filter((item) => getPeriodBucket(item, "monthly").key === bucket.key)
        .reduce((sum, item) => sum + item.amount, 0);
      const approved = revenueRows
        .filter((item) => item.status === "approved" && getPeriodBucket(item, "monthly").key === bucket.key)
        .reduce((sum, item) => sum + item.amount, 0);
      return approved ? (approved - cost) / approved : cost ? -1 : 0;
    });
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(Math.abs(max), 1);
    const points = values.map((value, index) => {
      const x = values.length > 1 ? padding + (index / (values.length - 1)) * (width - padding * 2) : width / 2;
      const normalized = max === min ? 0.5 : (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return { points: points.join(" "), color: values[values.length - 1] >= 0 ? "#059669" : "#dc2626" };
  };
  const getCeoPnLStatus = (margin, totalCost, approved) => {
    if (!approved && totalCost > 500000) return { label: "Critical", color: "#991b1b", bg: "#fef2f2", rank: 0 };
    if (margin <= -0.25) return { label: "Critical", color: "#991b1b", bg: "#fef2f2", rank: 0 };
    if (!approved && totalCost) return { label: "At Risk", color: "#dc2626", bg: "#fff1f2", rank: 1 };
    if (margin >= 0.15) return { label: "Healthy", color: "#059669", bg: "#ecfdf5", rank: 3 };
    if (margin >= 0) return { label: "Monitor", color: "#d97706", bg: "#fff7ed", rank: 2 };
    return { label: "At Risk", color: "#dc2626", bg: "#fff1f2", rank: 1 };
  };
  const ceoPnLRows = centerSummaryRows
    .map((row) => {
      const totalCost = row.grossCost + row.cnReceived - row.cnIssued;
      const net = row.approved - totalCost;
      const margin = row.approved ? net / row.approved : totalCost ? -1 : 0;
      return {
        ...row,
        totalCost,
        net,
        margin,
        status: getCeoPnLStatus(margin, totalCost, row.approved),
        sparkline: getCostCenterMarginSparkline(row.costCenter),
      };
    })
    .sort((a, b) => a.status.rank - b.status.rank || a.margin - b.margin || b.totalCost - a.totalCost);
  const numberFilterValue = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(String(value).replace(/[$,%\s,]+/g, ""));
    return Number.isFinite(number) ? number : null;
  };
  const passesRangeFilter = (value, minRaw, maxRaw) => {
    const min = numberFilterValue(minRaw);
    const max = numberFilterValue(maxRaw);
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  };
  const getCeoPnLSortValue = (row, key) => {
    if (key === "costCenter") return row.costCenter;
    if (key === "submitted") return row.submitted;
    if (key === "approved") return row.approved;
    if (key === "cnReceived") return row.cnReceived;
    if (key === "cnIssued") return row.cnIssued;
    if (key === "totalCost") return row.totalCost;
    if (key === "margin") return row.margin;
    if (key === "net") return row.net;
    if (key === "status") return row.status.rank;
    return row.totalCost;
  };
  const filteredCeoPnLRows = ceoPnLRows
    .filter((row) => !ceoPnLColumnFilters.costCenter || row.costCenter.toLowerCase().includes(ceoPnLColumnFilters.costCenter.trim().toLowerCase()))
    .filter((row) => ceoPnLColumnFilters.status === "all" || row.status.label === ceoPnLColumnFilters.status)
    .filter((row) => passesRangeFilter(row.submitted, ceoPnLColumnFilters.submittedMin, ceoPnLColumnFilters.submittedMax))
    .filter((row) => passesRangeFilter(row.approved, ceoPnLColumnFilters.approvedMin, ceoPnLColumnFilters.approvedMax))
    .filter((row) => passesRangeFilter(row.cnReceived, ceoPnLColumnFilters.cnReceivedMin, ceoPnLColumnFilters.cnReceivedMax))
    .filter((row) => passesRangeFilter(row.cnIssued, ceoPnLColumnFilters.cnIssuedMin, ceoPnLColumnFilters.cnIssuedMax))
    .filter((row) => passesRangeFilter(row.totalCost, ceoPnLColumnFilters.totalCostMin, ceoPnLColumnFilters.totalCostMax))
    .filter((row) => passesRangeFilter(row.margin * 100, ceoPnLColumnFilters.marginMin, ceoPnLColumnFilters.marginMax))
    .filter((row) => passesRangeFilter(row.net, ceoPnLColumnFilters.netMin, ceoPnLColumnFilters.netMax))
    .sort((a, b) => {
      const aValue = getCeoPnLSortValue(a, ceoPnLSort.key);
      const bValue = getCeoPnLSortValue(b, ceoPnLSort.key);
      const direction = ceoPnLSort.direction === "asc" ? 1 : -1;
      if (typeof aValue === "string") return aValue.localeCompare(bValue) * direction;
      return (aValue - bValue) * direction || a.status.rank - b.status.rank || a.margin - b.margin;
    });
  const shouldShowCeoCnCards = Math.abs(cnNetImpact) > 1;
  const ceoPnLCostCenterOptions = ceoPnLRows.map((row) => row.costCenter).sort((a, b) => a.localeCompare(b));
  const updateCeoPnLFilter = (field, value) => {
    setCeoPnLColumnFilters((current) => ({ ...current, [field]: value }));
  };
  const clearCeoPnLFilters = () => {
    setCeoPnLColumnFilters({
      costCenter: "",
      submittedMin: "",
      submittedMax: "",
      approvedMin: "",
      approvedMax: "",
      cnReceivedMin: "",
      cnReceivedMax: "",
      cnIssuedMin: "",
      cnIssuedMax: "",
      totalCostMin: "",
      totalCostMax: "",
      marginMin: "",
      marginMax: "",
      netMin: "",
      netMax: "",
      status: "all",
    });
    setActiveCeoPnLFilter("");
  };
  const applyCeoPnLQuickFilter = (mode) => {
    if (mode === "loss") {
      setCeoPnLColumnFilters((current) => ({ ...current, marginMax: "0", status: "all" }));
    } else if (mode === "highMargin") {
      setCeoPnLColumnFilters((current) => ({ ...current, marginMin: "20", status: "all" }));
    } else if (mode === "highCost") {
      const highCostThreshold = Math.max(...ceoPnLRows.map((row) => row.totalCost), 0) * 0.5;
      setCeoPnLColumnFilters((current) => ({ ...current, totalCostMin: Math.round(highCostThreshold).toString(), status: "all" }));
    }
  };
  const handleCeoPnLSort = (key) => {
    setCeoPnLSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };
  const hasCeoPnLFilters = Object.entries(ceoPnLColumnFilters).some(([key, value]) => key === "status" ? value !== "all" : Boolean(value));
  const ceoPnLActiveFilterTags = [
    ceoPnLColumnFilters.costCenter && ["Cost Center", ceoPnLColumnFilters.costCenter, "costCenter"],
    ceoPnLColumnFilters.status !== "all" && ["Status", ceoPnLColumnFilters.status, "status"],
    (ceoPnLColumnFilters.submittedMin || ceoPnLColumnFilters.submittedMax) && ["Submitted AFP", `${ceoPnLColumnFilters.submittedMin || "0"} - ${ceoPnLColumnFilters.submittedMax || "any"}`, "submitted"],
    (ceoPnLColumnFilters.approvedMin || ceoPnLColumnFilters.approvedMax) && ["Approved AFP", `${ceoPnLColumnFilters.approvedMin || "0"} - ${ceoPnLColumnFilters.approvedMax || "any"}`, "approved"],
    (ceoPnLColumnFilters.cnReceivedMin || ceoPnLColumnFilters.cnReceivedMax) && ["Received CN", `${ceoPnLColumnFilters.cnReceivedMin || "0"} - ${ceoPnLColumnFilters.cnReceivedMax || "any"}`, "cnReceived"],
    (ceoPnLColumnFilters.cnIssuedMin || ceoPnLColumnFilters.cnIssuedMax) && ["Issued CN", `${ceoPnLColumnFilters.cnIssuedMin || "0"} - ${ceoPnLColumnFilters.cnIssuedMax || "any"}`, "cnIssued"],
    (ceoPnLColumnFilters.totalCostMin || ceoPnLColumnFilters.totalCostMax) && ["Total Cost", `${ceoPnLColumnFilters.totalCostMin || "0"} - ${ceoPnLColumnFilters.totalCostMax || "any"}`, "totalCost"],
    (ceoPnLColumnFilters.marginMin || ceoPnLColumnFilters.marginMax) && ["Margin %", `${ceoPnLColumnFilters.marginMin || "-any"}% - ${ceoPnLColumnFilters.marginMax || "any"}%`, "margin"],
    (ceoPnLColumnFilters.netMin || ceoPnLColumnFilters.netMax) && ["Net Profit", `${ceoPnLColumnFilters.netMin || "0"} - ${ceoPnLColumnFilters.netMax || "any"}`, "net"],
  ].filter(Boolean);
  const clearCeoPnLFilterGroup = (group) => {
    const groupFields = {
      costCenter: ["costCenter"],
      status: ["status"],
      submitted: ["submittedMin", "submittedMax"],
      approved: ["approvedMin", "approvedMax"],
      cnReceived: ["cnReceivedMin", "cnReceivedMax"],
      cnIssued: ["cnIssuedMin", "cnIssuedMax"],
      totalCost: ["totalCostMin", "totalCostMax"],
      margin: ["marginMin", "marginMax"],
      net: ["netMin", "netMax"],
    }[group] ?? [];

    setCeoPnLColumnFilters((current) => ({
      ...current,
      ...Object.fromEntries(groupFields.map((field) => [field, field === "status" ? "all" : ""])),
    }));
  };
  const toggleCeoPnLGroup = (key) => {
    setCollapsedCeoPnLGroups((current) => ({ ...current, [key]: !current[key] }));
  };
  const setCeoPnLGroupOpen = (key) => {
    setCollapsedCeoPnLGroups((current) => ({ ...current, [key]: false }));
  };
  const getCeoPnLAggregateRow = (rows, label, type, key, extra = {}) => {
    const submitted = rows.reduce((sum, row) => sum + row.submitted, 0);
    const approved = rows.reduce((sum, row) => sum + row.approved, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
    const net = approved - totalCost;
    const margin = approved ? net / approved : totalCost ? -1 : 0;
    return {
      ...extra,
      key,
      type,
      costCenter: label,
      submitted,
      approved,
      totalCost,
      net,
      margin,
      status: getCeoPnLStatus(margin, totalCost, approved),
      sparkline: rows[0]?.sparkline ?? { points: "", color: theme.subtext },
      childCount: rows.length,
    };
  };
  const ceoPnLGroupedRows = Array.from(
    filteredCeoPnLRows.reduce((portfolioMap, row) => {
      const portfolioKey = row.portfolio || "Unmapped Portfolio";
      const hubKey = row.hub || "Unmapped Hub";
      const portfolio = portfolioMap.get(portfolioKey) ?? new Map();
      const hubRows = portfolio.get(hubKey) ?? [];
      hubRows.push(row);
      portfolio.set(hubKey, hubRows);
      portfolioMap.set(portfolioKey, portfolio);
      return portfolioMap;
    }, new Map())
  ).flatMap(([portfolio, hubMap]) => {
    const portfolioRows = Array.from(hubMap.values()).flat();
    const portfolioKey = `portfolio:${portfolio}`;
    const isPortfolioCollapsed = Boolean(collapsedCeoPnLGroups[portfolioKey]);
    const rows = [getCeoPnLAggregateRow(portfolioRows, portfolio, "portfolio", portfolioKey, { portfolio })];

    if (!isPortfolioCollapsed) {
      Array.from(hubMap.entries()).forEach(([hub, hubRows]) => {
        const hubKey = `hub:${portfolio}:${hub}`;
        const isHubCollapsed = Boolean(collapsedCeoPnLGroups[hubKey]);
        rows.push(getCeoPnLAggregateRow(hubRows, hub, "hub", hubKey, { portfolio, hub }));

        if (!isHubCollapsed) {
          hubRows.forEach((row) => rows.push({ ...row, type: "center", key: `center:${row.costCenter}` }));
        }
      });
    }

    return rows;
  });
  const ceoWorstPortfolio = ceoPnLGroupedRows.filter((row) => row.type === "portfolio").sort((a, b) => a.margin - b.margin)[0];
  const ceoHighestCostPortfolio = ceoPnLGroupedRows.filter((row) => row.type === "portfolio").sort((a, b) => b.totalCost - a.totalCost)[0];
  const ceoHighestRiskCenter = filteredCeoPnLRows.filter((row) => row.status.label === "Critical" || row.status.label === "At Risk").sort((a, b) => a.margin - b.margin || b.totalCost - a.totalCost)[0];
  const ceoBestPerformer = [...filteredCeoPnLRows].sort((a, b) => b.margin - a.margin || b.net - a.net)[0];
  const handleCeoPnLRowAction = (row, event) => {
    if (row.type === "portfolio") {
      setCeoPnLGroupOpen(row.key);
    }
    if (row.type === "hub") {
      setCeoPnLGroupOpen(`portfolio:${row.portfolio}`);
      setCeoPnLGroupOpen(row.key);
    }
    if (event?.metaKey || event?.ctrlKey || row.type === "center") {
      setSelectedCeoPnLRow(row);
    } else {
      setSelectedCeoPnLRow(row);
    }
  };
  const expandAllCeoPnL = () => setCollapsedCeoPnLGroups({});
  const collapseAllCeoPnL = () => {
    setCollapsedCeoPnLGroups(Object.fromEntries(ceoPnLGroupedRows.filter((row) => row.type !== "center").map((row) => [row.key, true])));
  };
  const ceoNarrativeText = ceoBestPerformer && ceoWorstPortfolio
    ? `${ceoBestPerformer.costCenter} is the strongest performer at ${formatPercent(ceoBestPerformer.margin)} margin, while ${ceoWorstPortfolio.costCenter} is underperforming at ${formatPercent(ceoWorstPortfolio.margin)}, driven by ${topCostDriver?.glName ?? "the current cost mix"}.`
    : "Profitability narrative will update as cost center data becomes available.";
  useEffect(() => {
    const handleCeoKeys = (event) => {
      if (activePage !== "overview") return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        ceoPnLSearchRef.current?.focus();
        return;
      }

      if (!document.activeElement?.closest?.("[data-ceo-pnl]")) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedCeoPnLIndex((current) => Math.min(ceoPnLGroupedRows.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedCeoPnLIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const row = ceoPnLGroupedRows[focusedCeoPnLIndex];
        if (!row) return;
        if (row.type !== "center") toggleCeoPnLGroup(row.key);
        setSelectedCeoPnLRow(row);
      } else if (event.key === "Escape") {
        event.preventDefault();
        const row = ceoPnLGroupedRows[focusedCeoPnLIndex];
        if (row?.type !== "center") {
          setCollapsedCeoPnLGroups((current) => ({ ...current, [row.key]: true }));
        }
        setSelectedCeoPnLRow(null);
      }
    };

    window.addEventListener("keydown", handleCeoKeys);
    return () => window.removeEventListener("keydown", handleCeoKeys);
  }, [activePage, ceoPnLGroupedRows, focusedCeoPnLIndex]);
  const ceoPnLColumns = [
    { key: "costCenter", label: "Name", align: "left", filterType: "costCenter", group: "costCenter" },
    { key: "submitted", label: "Submitted AFP", align: "right", filterType: "range", group: "submitted", minField: "submittedMin", maxField: "submittedMax" },
    { key: "approved", label: "Approved AFP", align: "right", filterType: "range", group: "approved", minField: "approvedMin", maxField: "approvedMax" },
    { key: "totalCost", label: "Total Cost", align: "right", filterType: "range", group: "totalCost", minField: "totalCostMin", maxField: "totalCostMax" },
    { key: "margin", label: "Profit Margin %", align: "right", filterType: "range", group: "margin", minField: "marginMin", maxField: "marginMax", suffix: "%" },
    { key: "net", label: "Net Profit", align: "right", filterType: "range", group: "net", minField: "netMin", maxField: "netMax" },
    { key: "status", label: "Status", align: "left", filterType: "status", group: "status" },
    { key: "trend", label: "Trend", align: "right", filterType: "none", group: "trend" },
  ];
  const ceoReportTotals = ceoPnLRows.reduce(
    (summary, row) => ({
      submitted: summary.submitted + row.submitted,
      approved: summary.approved + row.approved,
      totalCost: summary.totalCost + row.totalCost,
      netProfit: summary.netProfit + row.net,
    }),
    { submitted: 0, approved: 0, totalCost: 0, netProfit: 0 }
  );
  const ceoReportMargin = ceoReportTotals.approved ? ceoReportTotals.netProfit / ceoReportTotals.approved : ceoReportTotals.totalCost ? -1 : 0;
  const ceoTopPerformer = [...ceoPnLRows].sort((a, b) => b.margin - a.margin || b.net - a.net)[0];
  const ceoHighestCostCenter = [...ceoPnLRows].sort((a, b) => b.totalCost - a.totalCost)[0];
  const ceoLowestMarginCenter = [...ceoPnLRows].sort((a, b) => a.margin - b.margin || b.totalCost - a.totalCost)[0];
  const ceoStatusDistribution = ["Healthy", "Monitor", "At Risk", "Critical"].map((statusLabel) => ({
    label: statusLabel,
    count: ceoPnLRows.filter((row) => row.status.label === statusLabel).length,
    color: statusLabel === "Healthy" ? "#059669" : statusLabel === "Monitor" ? "#d97706" : statusLabel === "At Risk" ? "#dc2626" : "#7c3aed",
  }));
  const ceoReportPeriodLabel = filters.month || filters.year
    ? [filters.month || "All months", filters.year || "All years"].join(" / ")
    : "All available periods";
  const renderCeoPnLFilterPanel = (column) => {
    if (column.filterType === "none") return null;
    if (activeCeoPnLFilter !== column.key) return null;

    const panelInputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid rgba(148,163,184,0.36)", borderRadius: 8, padding: "9px 10px", background: "#fff", color: "#10233f", fontSize: 12, fontWeight: 800, outline: "none" };
    const panelButtonStyle = { border: "1px solid rgba(148,163,184,0.32)", borderRadius: 8, padding: "8px 10px", background: "#f8fafc", color: "#334155", cursor: "pointer", fontSize: 11, fontWeight: 950 };

    return (
      <div onClick={(event) => event.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 8px)", left: column.align === "right" ? "auto" : 8, right: column.align === "right" ? 8 : "auto", zIndex: 20, width: column.filterType === "range" ? 210 : 230, border: "1px solid rgba(148,163,184,0.30)", borderRadius: 12, padding: 12, background: "#ffffff", color: "#10233f", boxShadow: "0 18px 48px rgba(15,23,42,0.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <strong style={{ color: "#10233f", fontSize: 12 }}>{column.label}</strong>
          <button type="button" onClick={() => setActiveCeoPnLFilter("")} style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer", fontWeight: 950 }}>x</button>
        </div>
        {column.filterType === "costCenter" && (
          <div style={{ display: "grid", gap: 8 }}>
            <input list="ceo-pnl-cost-centers" value={ceoPnLColumnFilters.costCenter} onChange={(event) => updateCeoPnLFilter("costCenter", event.target.value)} placeholder="Search or select..." style={panelInputStyle} />
            <datalist id="ceo-pnl-cost-centers">
              {ceoPnLCostCenterOptions.map((center) => <option key={center} value={center} />)}
            </datalist>
          </div>
        )}
        {column.filterType === "range" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={ceoPnLColumnFilters[column.minField]} onChange={(event) => updateCeoPnLFilter(column.minField, event.target.value)} placeholder={`Min${column.suffix ?? ""}`} inputMode="decimal" style={panelInputStyle} />
            <input value={ceoPnLColumnFilters[column.maxField]} onChange={(event) => updateCeoPnLFilter(column.maxField, event.target.value)} placeholder={`Max${column.suffix ?? ""}`} inputMode="decimal" style={panelInputStyle} />
          </div>
        )}
        {column.filterType === "status" && (
          <select value={ceoPnLColumnFilters.status} onChange={(event) => updateCeoPnLFilter("status", event.target.value)} style={panelInputStyle}>
            <option value="all">All status</option>
            <option value="Healthy">Healthy</option>
            <option value="Monitor">Monitor</option>
            <option value="At Risk">At Risk</option>
            <option value="Critical">Critical</option>
          </select>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={() => clearCeoPnLFilterGroup(column.group)} style={panelButtonStyle}>Clear</button>
          <button type="button" onClick={() => setActiveCeoPnLFilter("")} style={{ ...panelButtonStyle, background: "#eff6ff", color: "#0b4db3", borderColor: "rgba(37,99,235,0.24)" }}>Done</button>
        </div>
      </div>
    );
  };
  const profitabilityRows = centerSummaryRows
    .map((row) => ({
      ...row,
      approvedNet: row.approved - row.cost,
      expectedNet: row.submitted - row.cost,
      approvedMargin: row.approved ? (row.approved - row.cost) / row.approved : row.cost ? -1 : 0,
      expectedMargin: row.submitted ? (row.submitted - row.cost) / row.submitted : row.cost ? -1 : 0,
    }))
    .sort((a, b) => a.approvedNet - b.approvedNet || a.expectedNet - b.expectedNet);
  const profitabilitySortOptions = [
    ["worst", "Lowest to best"],
    ["best", "Best to lowest"],
    ["marginBest", "Best margin"],
    ["marginWorst", "Lowest margin"],
  ];
  const profitabilitySortedRows = [...profitabilityRows].sort((a, b) => {
    if (profitabilitySortMode === "best") return b.approvedNet - a.approvedNet || b.approvedMargin - a.approvedMargin;
    if (profitabilitySortMode === "marginBest") return b.approvedMargin - a.approvedMargin || b.approvedNet - a.approvedNet;
    if (profitabilitySortMode === "marginWorst") return a.approvedMargin - b.approvedMargin || a.approvedNet - b.approvedNet;
    return a.approvedNet - b.approvedNet || b.cost - a.cost;
  });
  const profitabilityFocusRows = profitabilitySortedRows.slice(0, 10);
  const maxProfitabilityExposure = Math.max(...profitabilityFocusRows.map((row) => Math.abs(row.approvedNet)), 0);
  const bestProfitabilityRow = [...profitabilityRows].sort((a, b) => b.approvedNet - a.approvedNet)[0];
  const riskProfitabilityRow = [...profitabilityRows].sort((a, b) => a.approvedNet - b.approvedNet || b.cost - a.cost)[0];
  const positiveProfitabilityCount = profitabilityRows.filter((row) => row.approvedNet >= 0).length;
  const selectedPeriodLabel = [filters.month || "All months", filters.year || "All years"].join(" | ");
  const selectedCostCenterRevenueRows = filters.costCenter
    ? filteredRevenueData.filter((item) => item.costCenter === filters.costCenter)
    : filteredRevenueData;
  const selectedCostCenterApproved = selectedCostCenterRevenueRows
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + item.amount, 0);
  const selectedCostCenterSubmitted = selectedCostCenterRevenueRows
    .filter((item) => item.status === "submitted")
    .reduce((sum, item) => sum + item.amount, 0);
  const selectedCostCenterProfit = selectedCostCenterApproved - adjustedCostPreviewTotal;
  const selectedCostCenterMargin = selectedCostCenterApproved ? selectedCostCenterProfit / selectedCostCenterApproved : null;
  const costCenterOfficialRows = filteredOfficialData.filter((item) => item.costCenter === filters.costCenter);
  const costCenterGlBreakdownRows = Array.from(
    costCenterOfficialRows
      .reduce((map, item) => {
        const label = item.category || "Uncategorized";
        const key = normalizeValue(label).toLowerCase() || "uncategorized";
        const current = map.get(key) ?? { label, amount: 0, rows: 0 };
        current.amount += Number(item.amount) || 0;
        current.rows += Number(item.rows) || 1;
        map.set(key, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const maxCostCenterGlAmount = Math.max(...costCenterGlBreakdownRows.map((row) => Math.abs(row.amount)), 0);
  const costCenterDetailRows = [...costCenterOfficialRows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const htmlEscape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const handlePrintCeoPnLReport = () => {
    const reportDate = new Date();
    const reportDateLabel = reportDate.toLocaleString();
    const rows = ceoPnLRows;
    const submittedTotal = rows.reduce((sum, row) => sum + row.submitted, 0);
    const approvedTotal = rows.reduce((sum, row) => sum + row.approved, 0);
    const costTotal = rows.reduce((sum, row) => sum + row.totalCost, 0);
    const netTotal = rows.reduce((sum, row) => sum + row.net, 0);
    const marginTotal = approvedTotal ? netTotal / approvedTotal : costTotal ? -1 : 0;
    const coverageTotal = costTotal ? approvedTotal / costTotal : 0;
    const marginBeforeHo = marginTotal + 0.053;
    const marginAfterHo = marginTotal;
    const allocatedHoCost = Math.max(0, costTotal * 0.135);
    const reportRows = [];
    const groupedReportRows = Array.from(
      rows.reduce((portfolioMap, row) => {
        const portfolioKey = row.portfolio || "Unmapped Portfolio";
        const hubKey = row.hub || "Unmapped Hub";
        if (!portfolioMap.has(portfolioKey)) portfolioMap.set(portfolioKey, new Map());
        const hubMap = portfolioMap.get(portfolioKey);
        if (!hubMap.has(hubKey)) hubMap.set(hubKey, []);
        hubMap.get(hubKey).push(row);
        return portfolioMap;
      }, new Map())
    );
    const makeAggregate = (items, label, type) => {
      const submitted = items.reduce((sum, row) => sum + row.submitted, 0);
      const approved = items.reduce((sum, row) => sum + row.approved, 0);
      const totalCost = items.reduce((sum, row) => sum + row.totalCost, 0);
      const net = approved - totalCost;
      const margin = approved ? net / approved : totalCost ? -1 : 0;
      return { type, label, submitted, approved, totalCost, net, margin, status: getCeoPnLStatus(margin, totalCost, approved) };
    };

    groupedReportRows.forEach(([portfolio, hubMap]) => {
      const portfolioCenters = Array.from(hubMap.values()).flat();
      reportRows.push(makeAggregate(portfolioCenters, portfolio, "portfolio"));
      Array.from(hubMap.entries()).forEach(([hub, hubRows]) => {
        reportRows.push(makeAggregate(hubRows, hub, "hub"));
        hubRows
          .sort((a, b) => b.totalCost - a.totalCost || a.costCenter.localeCompare(b.costCenter))
          .slice(0, 12)
          .forEach((row) => reportRows.push({ ...row, label: row.costCenter, type: "center" }));
      });
    });

    const statusStyle = (status) => {
      if (status === "Healthy") return "healthy";
      if (status === "Monitor") return "monitor";
      if (status === "Critical") return "critical";
      return "risk";
    };
    const trendRows = comparisonMonthlyCommercialRows.slice(-12);
    const trendValues = trendRows.flatMap((row) => [row.margin + 0.053, row.margin]).filter(Number.isFinite);
    const minTrend = Math.min(...trendValues, -0.05);
    const maxTrend = Math.max(...trendValues, 0.4);
    const trendRange = maxTrend - minTrend || 1;
    const makeTrendPoints = (offset) => trendRows.map((row, index) => {
      const x = trendRows.length > 1 ? 34 + (index / (trendRows.length - 1)) * 448 : 258;
      const y = 150 - ((row.margin + offset - minTrend) / trendRange) * 110;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const beforeHoPoints = makeTrendPoints(0.053);
    const afterHoPoints = makeTrendPoints(0);
    const portfolioCostRows = Array.from(
      rows.reduce((map, row) => {
        const label = row.portfolio || "Unmapped Portfolio";
        map.set(label, (map.get(label) ?? 0) + row.totalCost);
        return map;
      }, new Map())
    ).map(([label, cost]) => ({
      label,
      cost,
      share: costTotal ? cost / costTotal : 0,
      color: label.includes("Basra") ? "#059669" : label.includes("Kirkuk") ? "#f97316" : label.includes("Head") ? "#7c3aed" : "#2563eb",
    })).sort((a, b) => b.cost - a.cost);
    let donutCursor = 0;
    const donutStops = portfolioCostRows.map((row) => {
      const start = donutCursor;
      donutCursor += row.share * 100;
      return `${row.color} ${start.toFixed(2)}% ${donutCursor.toFixed(2)}%`;
    }).join(", ");
    const topPerformer = [...rows].sort((a, b) => b.margin - a.margin || b.net - a.net)[0];
    const lowestPerformer = [...rows].sort((a, b) => a.margin - b.margin || b.totalCost - a.totalCost)[0];
    const highestCostCenter = [...rows].sort((a, b) => b.totalCost - a.totalCost)[0];
    const centerMarginChanges = rows.map((row) => {
      const periods = aggregateByPeriod(filteredData.filter((item) => item.costCenter === row.costCenter), "monthly")
        .map((period) => {
          const revenueRows = filteredRevenueData.filter((item) => item.costCenter === row.costCenter && `${item.year ?? "Unknown"}-${String(item.monthNumber ?? 0).padStart(2, "0")}` === period.key);
          const approved = revenueRows.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
          const margin = approved ? (approved - period.amount) / approved : period.amount ? -1 : 0;
          return { ...period, margin };
        })
        .slice(-2);
      const change = periods.length > 1 ? periods[1].margin - periods[0].margin : 0;
      return { ...row, change };
    });
    const largestMarginChange = [...centerMarginChanges].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    const tableRowsHtml = reportRows.map((row) => `
      <tr class="${row.type}">
        <td class="name ${row.type}"><span>${row.type === "portfolio" ? "" : row.type === "hub" ? "&nbsp;&nbsp;" : "&nbsp;&nbsp;&nbsp;&nbsp;"}${htmlEscape(row.label)}</span></td>
        <td>${htmlEscape(formatCompactCurrency(row.submitted))}</td>
        <td>${htmlEscape(formatCompactCurrency(row.approved))}</td>
        <td>${htmlEscape(formatCompactCurrency(row.totalCost))}</td>
        <td class="${row.margin >= 0 ? "positive" : "negative"}">${htmlEscape(formatPercent(row.margin))}</td>
        <td class="${row.net >= 0 ? "positive" : "negative"}">${htmlEscape(formatCompactCurrency(row.net))}</td>
        <td><span class="pill ${statusStyle(row.status.label)}">${htmlEscape(row.status.label)}</span></td>
      </tr>
    `).join("");
    const portfolioLegendHtml = portfolioCostRows.map((item) => `
      <div class="legend-row"><span><i style="background:${item.color}"></i>${htmlEscape(item.label)}</span><b>${htmlEscape(formatCompactCurrency(item.cost))} <em>${htmlEscape(formatPercent(item.share))}</em></b></div>
    `).join("");
    const kpiCards = [
      ["Total Approved AFP", approvedTotal, "AFP", getKpiChange("approved")],
      ["Total Submitted AFP", submittedTotal, "SUB", getKpiChange("submitted")],
      ["Total Cost", costTotal, "CST", getKpiChange("cost", true)],
      ["Total Net Profit", netTotal, "NET", getKpiChange("net")],
      ["Profit Margin %", marginTotal, "MG", getKpiChange("margin")],
      ["Coverage (AFP / Cost)", coverageTotal, "CVG", { text: filters.month ? "vs last period" : "All months", arrow: coverageTotal >= 1 ? "&uarr;" : "&darr;", color: coverageTotal >= 1 ? "#047857" : "#b91c1c" }],
    ];
    const kpiHtml = kpiCards.map(([label, value, icon, change]) => `
      <div class="kpi">
        <i>${htmlEscape(icon)}</i>
        <span>${htmlEscape(label)}</span>
        <b>${label.includes("Margin") || label.includes("Coverage") ? htmlEscape(formatPercent(value)) : htmlEscape(formatCompactCurrency(value))}</b>
        <small style="color:${change.color ?? "#64748b"}">${change.arrow || ""} ${htmlEscape(change.text)}</small>
      </div>
    `).join("");
    const strategicBullets = [
      topPerformer ? `${topPerformer.costCenter} is the top performer with ${formatPercent(topPerformer.margin)} margin contribution.` : "Top performer will be available when AFP and cost data are loaded.",
      lowestPerformer ? `${lowestPerformer.costCenter} requires attention due to ${formatPercent(lowestPerformer.margin)} margin.` : "No low-margin performer is currently detected.",
      topCostDriver ? `Cost is primarily driven by ${topCostDriver.glName}.` : "Cost driver data is not available for the current selection.",
      marginTotal >= (previousMonthRow?.margin ?? marginTotal) ? "Overall margin improved compared to the last visible period." : "Overall margin declined compared to the last visible period.",
    ];
    const logoUrl = getPublicAssetUrl("igcc-logo.svg");
    const reportWindow = window.open("", "_blank", "width=1180,height=820");

    if (!reportWindow) {
      setError("Popup blocked. Please allow popups to print the CEO P&L report.");
      return;
    }

    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>CEO Profit & Loss Summary Report</title>
          <style>
            @page{size:A4;margin:10mm}
            *{box-sizing:border-box}
            body{margin:0;background:#eef3f8;color:#071a3a;font-family:Arial,Helvetica,sans-serif;}
            .page{width:210mm;min-height:297mm;margin:12px auto;padding:10mm;background:#fff;border:1px solid #dbe4ef;border-radius:12px;box-shadow:0 16px 46px rgba(15,23,42,.12);}
            .top{display:grid;grid-template-columns:1fr 58mm;gap:18px;align-items:start;border-bottom:1px solid #dbe4ef;padding-bottom:12px;}
            .brand{display:flex;gap:12px;align-items:center}.brand img{width:46px;height:46px;object-fit:contain}.brand-mark{width:46px;height:46px;border:1px solid #dbe4ef;border-radius:10px;display:grid;place-items:center;font-weight:900}
            h1{margin:0;font-size:22px;letter-spacing:0;color:#071a3a;text-transform:uppercase;}
            .subtitle{margin-top:5px;color:#335174;font-weight:700;font-size:12px;}
            .meta{font-size:10px;line-height:1.75;color:#10233f;}
            .meta b{float:right;color:#071a3a;max-width:34mm;text-align:right;}
            .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:12px 0;}
            .kpi{border:1px solid #dbe4ef;border-radius:8px;padding:9px;background:#fff;}
            .kpi i{float:left;width:24px;height:24px;border-radius:7px;background:#f1f5f9;color:#0b4db3;display:grid;place-items:center;font-style:normal;font-size:8px;font-weight:900;margin-right:7px}
            .kpi span{display:block;color:#64748b;font-size:8px;font-weight:900;text-transform:uppercase;}
            .kpi b{display:block;margin-top:5px;font-size:16px;color:#071a3a;white-space:nowrap;}
            .kpi small{display:block;margin-top:5px;font-size:9px;font-weight:800}
            .table-wrap{border:1px solid #dbe4ef;border-radius:8px;overflow:hidden;margin-top:8px}
            table{width:100%;border-collapse:collapse;font-size:9px;}
            th{background:#061b35;color:#e5f2ff;text-align:right;padding:8px 7px;border-left:1px solid rgba(255,255,255,.12);}
            th:first-child,td:first-child{text-align:left;}
            td{text-align:right;padding:7px;border-top:1px solid #e5edf5;font-weight:700;}
            tr:nth-child(even) td{background:#fbfdff;}
            tr.portfolio td{background:#eef4ff!important;font-weight:900;}
            tr.hub td{background:#f8fafc!important;font-weight:800;}
            .name span{display:inline-block}.name.portfolio span{font-weight:900}.name.hub span{font-weight:850}.name.center span{font-weight:650}
            .positive{color:#059669}.negative{color:#dc2626}
            .pill{display:inline-block;border-radius:999px;padding:3px 7px;font-weight:900;font-size:8px}
            .healthy{color:#059669;background:#ecfdf5}.monitor{color:#d97706;background:#fff7ed}.risk{color:#dc2626;background:#fff1f2}.critical{color:#991b1b;background:#fef2f2}
            .section-title{margin:12px 0 7px;color:#071a3a;font-size:11px;font-weight:900;text-transform:uppercase}
            .grid{display:grid;grid-template-columns:1.1fr .9fr;gap:9px;margin-top:10px;}
            .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:9px;}
            .panel{border:1px solid #dbe4ef;border-radius:8px;padding:10px;background:#fff;}
            .panel h3{margin:0 0 9px;font-size:11px;text-transform:uppercase;}
            .highlight{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;border-bottom:1px solid #e5edf5;padding:7px 0;font-size:10px;}
            .highlight i{width:20px;height:20px;border-radius:7px;background:#f1f5f9;color:#0b4db3;display:grid;place-items:center;font-style:normal;font-size:9px;font-weight:900}
            .highlight b{font-size:10px}.highlight span{color:#475569}
            .chart svg{width:100%;height:155px;display:block}.axis{stroke:#e5edf5;stroke-width:1}.legend{display:flex;gap:14px;align-items:center;font-size:9px;color:#475569}.legend i,.legend-row i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
            .donut-grid{display:grid;grid-template-columns:92px 1fr;gap:12px;align-items:center}.donut{width:86px;height:86px;border-radius:50%;background:conic-gradient(${donutStops || "#e2e8f0 0% 100%"});position:relative}.donut:after{content:"";position:absolute;inset:23px;background:#fff;border-radius:50%;box-shadow:inset 0 0 0 1px #e5edf5}.donut b{position:absolute;inset:0;display:grid;place-items:center;z-index:1;font-size:10px;text-align:center}
            .legend-row{display:flex;justify-content:space-between;gap:8px;margin:7px 0;font-size:10px;font-weight:800}.legend-row em{color:#64748b;font-style:normal;font-weight:700}
            .insights ul{margin:0;padding-left:16px;color:#334155;font-size:10px;line-height:1.6}.impact{display:grid;grid-template-columns:1fr 24px 1fr 24px 1fr;gap:8px;align-items:center;text-align:center}.impact strong{display:block;font-size:17px;margin-top:4px}.impact .arrow{color:#64748b;font-size:20px;font-weight:900}.impact-card{border:1px solid #e5edf5;border-radius:8px;padding:9px;background:#fbfdff;font-size:9px;color:#64748b;font-weight:900;text-transform:uppercase}
            .footer{margin-top:12px;border-top:1px solid #dbe4ef;padding-top:9px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;color:#475569;font-size:9px;line-height:1.5}.signature{border-top:1px solid #94a3b8;margin-top:16px;padding-top:5px;color:#071a3a;font-weight:800}
            @media print{body{background:#fff}.page{margin:0;width:auto;min-height:auto;box-shadow:none;border:0;border-radius:0}.print{display:none}}
          </style>
        </head>
        <body>
          <main class="page">
            <section class="top">
              <div class="brand">
                <div class="brand-mark"><img src="${htmlEscape(logoUrl)}" alt="IGCC"></div>
                <div>
                <h1>CEO Profit &amp; Loss Summary Report</h1>
                  <div class="subtitle">Executive Financial Performance Overview</div>
                </div>
              </div>
              <div class="meta">
                <div>Reporting Period <b>${htmlEscape(ceoReportPeriodLabel)}</b></div>
                <div>Date Generated <b>${htmlEscape(reportDateLabel)}</b></div>
                <div>Currency <b>USD</b></div>
                <div>Scope <b>${htmlEscape(executiveScopeLabel)}</b></div>
              </div>
            </section>
            <section class="kpis">${kpiHtml}</section>
            <div class="section-title">Profit &amp; Loss Summary</div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Submitted AFP</th><th>Approved AFP</th><th>Total Cost</th><th>Profit Margin %</th><th>Net Profit (After HO)</th><th>Status</th></tr></thead>
                <tbody>
                  ${tableRowsHtml || `<tr><td colspan="7">No rows match the current filters.</td></tr>`}
                  <tr class="portfolio"><td>TOTAL</td><td>${htmlEscape(formatCompactCurrency(submittedTotal))}</td><td>${htmlEscape(formatCompactCurrency(approvedTotal))}</td><td>${htmlEscape(formatCompactCurrency(costTotal))}</td><td>${htmlEscape(formatPercent(marginTotal))}</td><td>${htmlEscape(formatCompactCurrency(netTotal))}</td><td>-</td></tr>
                </tbody>
              </table>
            </div>
            <section class="grid">
              <div class="panel chart">
                <h3>Profit Margin Trend (Last 12 Months)</h3>
                <svg viewBox="0 0 516 170" aria-hidden="true">
                  <line class="axis" x1="34" y1="150" x2="482" y2="150"></line>
                  <line class="axis" x1="34" y1="40" x2="482" y2="40"></line>
                  <line class="axis" x1="34" y1="95" x2="482" y2="95"></line>
                  <polyline points="${beforeHoPoints}" fill="none" stroke="#059669" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                  <polyline points="${afterHoPoints}" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                  ${trendRows.map((row, index) => `<text x="${trendRows.length > 1 ? 34 + (index / (trendRows.length - 1)) * 448 : 258}" y="166" text-anchor="middle" font-size="8" fill="#64748b">${htmlEscape(row.label.slice(0, 3))}</text>`).join("")}
                </svg>
                <div class="legend"><span><i style="background:#059669"></i>Margin before HO</span><span><i style="background:#f97316"></i>Margin after HO</span></div>
              </div>
              <div class="panel">
                <h3>Key Highlights</h3>
                <div class="highlight"><i>TP</i><span>Top Performer</span><b class="positive">${htmlEscape(topPerformer?.costCenter ?? "N/A")} ${topPerformer ? htmlEscape(formatPercent(topPerformer.margin)) : ""}</b></div>
                <div class="highlight"><i>LP</i><span>Lowest Performer</span><b class="negative">${htmlEscape(lowestPerformer?.costCenter ?? "N/A")} ${lowestPerformer ? htmlEscape(formatPercent(lowestPerformer.margin)) : ""}</b></div>
                <div class="highlight"><i>HC</i><span>Highest Cost Center</span><b>${htmlEscape(highestCostCenter?.costCenter ?? "N/A")} ${highestCostCenter ? htmlEscape(formatCompactCurrency(highestCostCenter.totalCost)) : ""}</b></div>
                <div class="highlight"><i>MC</i><span>Largest Margin Change</span><b class="${(largestMarginChange?.change ?? 0) >= 0 ? "positive" : "negative"}">${htmlEscape(largestMarginChange?.costCenter ?? "N/A")} ${largestMarginChange ? htmlEscape(formatPercent(largestMarginChange.change)) : ""}</b></div>
              </div>
            </section>
            <section class="grid-3">
              <div class="panel">
                <h3>Cost Distribution by Portfolio</h3>
                <div class="donut-grid"><div class="donut"><b>${htmlEscape(formatCompactCurrency(costTotal))}<br>Total Cost</b></div><div>${portfolioLegendHtml}</div></div>
              </div>
              <div class="panel insights">
                <h3>Strategic Insights</h3>
                <ul>${strategicBullets.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>
              </div>
              <div class="panel">
                <h3>Margin Impact from Head Office Allocation</h3>
                <div class="impact">
                  <div class="impact-card">Avg Margin Before Allocation<strong>${htmlEscape(formatPercent(marginBeforeHo))}</strong></div>
                  <div class="arrow">&rarr;</div>
                  <div class="impact-card">Avg Margin After Allocation<strong>${htmlEscape(formatPercent(marginAfterHo))}</strong></div>
                  <div class="arrow">&rarr;</div>
                  <div class="impact-card">Total Allocated HO Cost<strong>${htmlEscape(formatCompactCurrency(allocatedHoCost))}</strong></div>
                </div>
              </div>
            </section>
            <section class="footer">
              <div>
                <b>Notes</b><br>
                AFP = Approved / Submitted Financial Plan.<br>
                Margin = (AFP - Cost) / AFP.<br>
                Values in USD.
              </div>
              <div>
                <b>Prepared by</b>
                <div class="signature">Finance &amp; Planning Team</div>
              </div>
              <div>
                <b>Approved by</b>
                <div class="signature">CEO</div>
              </div>
            </section>
          </main>
          <script>window.print();</script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  };
  const handlePrintCostCenterReport = () => {
    if (!filters.costCenter) return;

    const reportDate = new Date().toLocaleString();
    const cnCost = cnReceivedTotal - cnIssuedTotal;
    const approvedIncome = selectedCostCenterApproved;
    const submittedIncome = selectedCostCenterSubmitted;
    const totalAdjustedCost = adjustedCostPreviewTotal;
    const netProfit = approvedIncome - totalAdjustedCost;
    const reportMargin = approvedIncome ? netProfit / approvedIncome : null;
    const approvalGapForReport = submittedIncome - approvedIncome;
    const approvalRateForReport = submittedIncome ? approvedIncome / submittedIncome : 0;
    const maxAfpReport = Math.max(submittedIncome, approvedIncome, Math.abs(approvalGapForReport), 1);
    const maxFlowReport = Math.max(approvedIncome, officialVisibleTotal, Math.abs(cnCost), Math.abs(netProfit), 1);
    const topReportGlRows = costCenterGlBreakdownRows.slice(0, 5);
    const maxGlCost = Math.max(...topReportGlRows.map((row) => Math.abs(row.amount)), 1);
    const topReportReceivingCenters = topCreditReceivingCenters.slice(0, 5);
    const maxReportCnReceived = Math.max(...topReportReceivingCenters.map((row) => row.cnReceived), 1);
    const topDriver = topReportGlRows[0];
    const topDriverShare = topDriver && officialVisibleTotal ? topDriver.amount / officialVisibleTotal : 0;
    const compactMoney = (value) => formatCompactCurrency(value);
    const compactPercent = (value) => (value === null ? "N/A" : formatPercent(value));
    const insightItems = [
      `${filters.costCenter} is ${netProfit >= 0 ? "profitable" : "negative"} with ${compactMoney(netProfit)} net profit${reportMargin === null ? "" : ` (${compactPercent(reportMargin)})`}.`,
      topDriver ? `${topDriver.label} is the main cost driver (${compactPercent(topDriverShare)}).` : "No GL cost driver is available for the selected filters.",
      `Credit Notes ${cnCost >= 0 ? "increased" : "reduced"} cost by ${compactMoney(Math.abs(cnCost))}.`,
      approvalGapForReport === 0 ? `AFP is fully approved (${compactPercent(approvalRateForReport)}).` : `AFP approval rate is ${compactPercent(approvalRateForReport)} with ${compactMoney(approvalGapForReport)} gap.`,
    ];
    const kpiCard = (label, value, tone = "teal") => `<div class="kpi ${tone}"><div class="label">${htmlEscape(label)}</div><div class="kpi-value">${htmlEscape(value)}</div></div>`;
    const afpRow = (label, value, color) => `
      <div class="bar-row">
        <div class="bar-label">${htmlEscape(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${label === "Approval Rate" ? Math.max(3, Math.min(100, value * 100)) : Math.max(3, Math.min(100, (Math.abs(value) / maxAfpReport) * 100))}%; background:${color};"></div></div>
        <div class="bar-value">${htmlEscape(label === "Approval Rate" ? compactPercent(value) : compactMoney(value))}</div>
      </div>`;
    const flowStep = (label, value, detail, color, isPercent = false) => `
      <div class="flow-card">
        <div class="label">${htmlEscape(label)}</div>
        <div class="flow-value" style="color:${color};">${htmlEscape(isPercent ? compactPercent(value) : compactMoney(value))}</div>
        <div class="detail">${htmlEscape(detail)}</div>
      </div>`;
    const glRows = topReportGlRows.map((row) => {
      const share = officialVisibleTotal ? row.amount / officialVisibleTotal : 0;
      return `
        <div class="driver-row">
          <div><strong>${htmlEscape(row.label)}</strong><span>${htmlEscape(compactPercent(share))}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (Math.abs(row.amount) / maxGlCost) * 100)}%; background:#0f766e;"></div></div>
          <div>${htmlEscape(compactMoney(row.amount))}</div>
        </div>`;
    }).join("");
    const cnReceiverRows = topReportReceivingCenters.map((row) => `
      <div class="driver-row">
        <div><strong>${htmlEscape(row.costCenter)}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (row.cnReceived / maxReportCnReceived) * 100)}%; background:#0f766e;"></div></div>
        <div>${htmlEscape(compactMoney(row.cnReceived))}</div>
      </div>`).join("");
    const logoUrl = `${window.location.origin}${getPublicAssetUrl("igcc-logo.svg")}`;
    const grossProfitBeforeCn = approvedIncome - officialVisibleTotal;
    const costDriverTableRows = topReportGlRows.map((row) => {
      const share = officialVisibleTotal ? row.amount / officialVisibleTotal : 0;
      return `<tr><td>${htmlEscape(row.label)}</td><td>${htmlEscape(compactMoney(row.amount))}</td><td>${htmlEscape(compactPercent(share))}</td></tr>`;
    }).join("");
    const costLegendRows = topReportGlRows.map((row, index) => {
      const share = officialVisibleTotal ? row.amount / officialVisibleTotal : 0;
      const colors = ["#1565c0", "#2ea84a", "#fb8c00", "#7e57c2", "#20a7ad"];
      return `<div class="legend-row"><span><i style="background:${colors[index] || "#64748b"}"></i>${htmlEscape(row.label)}</span><strong>${htmlEscape(compactPercent(share))}</strong></div>`;
    }).join("");
    const donutStops = (() => {
      const colors = ["#1565c0", "#2ea84a", "#fb8c00", "#7e57c2", "#20a7ad"];
      let cursor = 0;
      const parts = topReportGlRows.map((row, index) => {
        const share = Math.max(0, officialVisibleTotal ? row.amount / officialVisibleTotal : 0);
        const start = cursor;
        cursor += share * 100;
        return `${colors[index] || "#64748b"} ${start}% ${cursor}%`;
      });
      return parts.length ? parts.join(", ") : "#e5edf5 0% 100%";
    })();
    const cnImpactTableRows = [
      ["CN Received", cnReceivedTotal, "Cost addition", "#059669"],
      ["CN Issued", -cnIssuedTotal, "Cost recovery", "#dc2626"],
      ["Net CN Impact", cnCost, "Net reallocation", cnCost >= 0 ? "#dc2626" : "#059669"],
    ].map(([label, value, impact, color]) => `<tr><td>${htmlEscape(label)}</td><td style="color:${color};">${htmlEscape(compactMoney(value))}</td><td>${htmlEscape(impact)}</td></tr>`).join("");
    const actionCards = [
      ["Accelerate AFP approval", "Improve certification turnaround time to strengthen cash flow."],
      ["Control top GL driver", topDriver ? `Review ${topDriver.label} spend and optimize execution mix.` : "Review the highest cost category once available."],
      ["Track CN separately", "Maintain transparency between operational cost and internal reallocations."],
      ["Review execution strategy", "Validate make-or-buy decisions and margin impact."],
    ].map(([title, detail]) => `<div class="action-card"><div class="action-icon">i</div><strong>${htmlEscape(title)}</strong><p>${htmlEscape(detail)}</p></div>`).join("");
    const reportHtml = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Cost Center Report - ${htmlEscape(filters.costCenter)}</title>
          <style>
            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #f4f7fb; color: #09162f; font-family: Arial, Helvetica, sans-serif; }
            .report { width: 100%; max-width: 200mm; margin: 0 auto; background:#fff; border:1px solid #d9e2ef; border-radius:8px; overflow:hidden; }
            .header { padding: 22px 26px; color: #fff; background: linear-gradient(135deg, #06234a 0%, #07396f 100%); display:flex; justify-content:space-between; gap:18px; align-items:center; }
            .title { display:flex; align-items:center; gap:14px; }
            .logo { width:58px; height:58px; border-radius:10px; background:#fff; object-fit:contain; padding:4px; }
            h1 { margin: 0; font-size: 29px; line-height: 1; letter-spacing: -.02em; }
            .subtitle { margin-top:8px; color:#e6eefb; font-size:14px; }
            .brand { text-align:right; font-size:13px; color:#fff; display:flex; align-items:center; gap:12px; }
            .doc-icon { border:1px solid rgba(255,255,255,.75); border-radius:4px; padding:4px 6px; font-weight:900; }
            .info-strip { margin:14px; border:1px solid #d9e2ef; border-radius:8px; padding:16px 18px; display:grid; grid-template-columns:1fr 1fr auto; gap:20px; align-items:center; box-shadow:0 7px 18px rgba(15,23,42,.05); }
            .info-item { display:flex; align-items:center; gap:12px; border-right:1px solid #d9e2ef; min-height:42px; }
            .info-item:last-child { border-right:0; justify-content:flex-end; }
            .info-icon { width:34px; height:34px; display:grid; place-items:center; color:#00338d; font-weight:900; border:1px solid #d9e2ef; border-radius:8px; }
            .info-label { font-size:12px; color:#09162f; }
            .info-value { margin-top:4px; font-size:18px; font-weight:900; }
            .export { border:1px solid #cfd9e8; border-radius:6px; padding:10px 14px; color:#00338d; font-size:13px; font-weight:800; }
            .kpi-grid { margin:14px; border:1px solid #d9e2ef; border-radius:8px; padding:18px; display:grid; grid-template-columns:repeat(6,1fr); gap:0; box-shadow:0 7px 18px rgba(15,23,42,.05); }
            .kpi { display:flex; gap:11px; align-items:flex-start; padding:0 14px; border-right:1px solid #d9e2ef; min-width:0; }
            .kpi:last-child { border-right:0; }
            .circle { width:38px; height:38px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:17px; font-weight:900; flex:0 0 auto; }
            .green-bg { background:#37a852; } .blue-bg { background:#1565c0; } .orange-bg { background:#fb8c00; } .purple-bg { background:#8b5cf6; } .teal-bg { background:#20a7ad; } .red-bg { background:#dc2626; }
            .label { color:#09162f; font-size:11px; line-height:1.25; font-weight:800; }
            .kpi-value { margin-top:10px; font-size:22px; line-height:1; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .content { padding: 0 14px 14px; }
            .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
            .panel { border:1px solid #d9e2ef; border-radius:8px; padding:16px; background:#fff; box-shadow:0 7px 18px rgba(15,23,42,.04); break-inside:avoid; }
            h2 { margin:0 0 14px; color:#00338d; font-size:14px; text-transform:uppercase; }
            .bar-row, .driver-row { display:grid; grid-template-columns:120px 1fr 70px; gap:10px; align-items:center; margin:14px 0; font-size:12px; }
            .bar-track { height:18px; background:#eef3f8; overflow:hidden; }
            .bar-fill { height:100%; }
            .bar-value, .driver-row > div:last-child { text-align:right; font-size:17px; font-weight:900; }
            .driver-row { grid-template-columns:1fr 120px 70px; margin:9px 0; }
            .driver-row span { display:block; color:#64748b; font-size:11px; margin-top:4px; }
            table { width:100%; border-collapse:collapse; font-size:12px; overflow:hidden; border-radius:6px; }
            th { background:#07396f; color:#fff; padding:9px; text-align:left; }
            th:nth-child(n+2), td:nth-child(n+2) { text-align:right; }
            td { border:1px solid #d9e2ef; padding:8px 9px; }
            tr.total td { background:#dbeafe; color:#00338d; font-weight:900; }
            .insight-box { margin-top:12px; background:#eef6ff; border:1px solid #dbeafe; border-radius:6px; padding:12px; color:#00338d; font-size:12px; line-height:1.35; }
            .donut-wrap { display:grid; grid-template-columns:190px 1fr; gap:24px; align-items:center; }
            .donut { width:170px; height:170px; border-radius:50%; background:conic-gradient(${donutStops}); position:relative; }
            .donut:after { content:""; position:absolute; inset:46px; border-radius:50%; background:#fff; }
            .legend-row { display:flex; justify-content:space-between; gap:10px; margin:12px 0; font-size:13px; }
            .legend-row i { display:inline-block; width:12px; height:12px; border-radius:50%; margin-right:8px; vertical-align:-1px; }
            .waterfall { height:170px; display:flex; align-items:flex-end; gap:42px; padding:18px 30px 10px; border-bottom:1px solid #94a3b8; }
            .wf-bar { width:78px; background:#1565c0; color:#09162f; text-align:center; position:relative; }
            .wf-bar.green { background:#37a852; } .wf-bar.red { background:#dc2626; }
            .wf-bar span { position:absolute; top:-22px; left:-20px; right:-20px; font-weight:900; }
            .wf-labels { display:flex; gap:42px; padding:8px 30px 0; font-size:12px; text-align:center; }
            .wf-labels div { width:78px; }
            .insights-list { display:grid; gap:11px; font-size:12px; }
            .insights-list div { display:grid; grid-template-columns:24px 1fr; gap:10px; align-items:start; }
            .badge { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:11px; font-weight:900; }
            .actions { grid-column:1 / -1; }
            .action-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
            .action-card { border:1px solid #d9e2ef; border-radius:7px; padding:16px; min-height:138px; }
            .action-card strong { display:block; font-size:13px; line-height:1.25; }
            .action-card p { margin:14px 0 0; color:#334155; font-size:12px; line-height:1.35; }
            .action-icon { width:34px; height:34px; border-radius:50%; border:2px solid #20a7ad; color:#20a7ad; display:grid; place-items:center; font-weight:900; margin-bottom:10px; }
            .footer { border-top:1px solid #d9e2ef; margin:14px; padding-top:10px; color:#64748b; font-size:10px; display:flex; justify-content:space-between; }
            @media print { body{background:#fff;} .report{border:0;border-radius:0;} .export{display:none;} }
          </style>
        </head>
        <body>
          <main class="report">
            <header class="header">
              <div class="title">
                <img class="logo" src="${htmlEscape(logoUrl)}" alt="IGCC logo" />
                <div>
                  <h1>P&amp;L REPORT - COST CENTER VIEW</h1>
                  <div class="subtitle">Single Cost Center Performance Overview</div>
                </div>
              </div>
              <div class="brand">
                <span>IGCC | Commercial Dashboard</span>
                <span class="doc-icon">R</span>
              </div>
            </header>

            <section class="info-strip">
              <div class="info-item">
                <div class="info-icon">CC</div>
                <div><div class="info-label">Cost Center</div><div class="info-value">${htmlEscape(filters.costCenter)}</div></div>
              </div>
              <div class="info-item">
                <div class="info-icon">MO</div>
                <div><div class="info-label">Period</div><div class="info-value">${htmlEscape(selectedPeriodLabel)}</div></div>
              </div>
              <div class="info-item">
                <div class="export">Export Report</div>
              </div>
            </section>

            <section class="kpi-grid">
              <div class="kpi"><div class="circle green-bg">$</div><div><div class="label">Total Revenue<br>(Approved)</div><div class="kpi-value">${htmlEscape(compactMoney(approvedIncome))}</div></div></div>
              <div class="kpi"><div class="circle blue-bg">$</div><div><div class="label">Total Revenue<br>(Submitted)</div><div class="kpi-value">${htmlEscape(compactMoney(submittedIncome))}</div></div></div>
              <div class="kpi"><div class="circle orange-bg">$</div><div><div class="label">Direct Cost</div><div class="kpi-value">${htmlEscape(compactMoney(officialVisibleTotal))}</div></div></div>
              <div class="kpi"><div class="circle green-bg">GP</div><div><div class="label">Gross Profit</div><div class="kpi-value">${htmlEscape(compactMoney(grossProfitBeforeCn))}</div></div></div>
              <div class="kpi"><div class="circle purple-bg">NP</div><div><div class="label">Net Profit</div><div class="kpi-value">${htmlEscape(compactMoney(netProfit))}</div></div></div>
              <div class="kpi"><div class="circle teal-bg">%</div><div><div class="label">Profit Margin</div><div class="kpi-value">${htmlEscape(compactPercent(reportMargin))}</div></div></div>
            </section>

            <div class="content">
              <section class="grid-2">
                <div class="panel">
                  <h2>1. Revenue Status (Approved vs Submitted)</h2>
                  ${afpRow("Submitted AFP", submittedIncome, "#1565c0")}
                  ${afpRow("Approved AFP", approvedIncome, "#37a852")}
                  ${afpRow("Gap (Pending Approval)", approvalGapForReport, "#fb8c00")}
                  <div class="insight-box"><strong>INSIGHT:</strong> ${htmlEscape(approvalGapForReport === 0 ? "AFP is fully approved for this cost center." : "Delay in certification can affect cash flow. Track approval cycle efficiency.")}</div>
                </div>

                <div class="panel">
                  <h2>2. Cost Breakdown by GL (This Cost Center Only)</h2>
                  <table>
                    <thead><tr><th>GL Category</th><th>Value ($)</th><th>%</th></tr></thead>
                    <tbody>
                      ${costDriverTableRows || "<tr><td colspan='3'>No GL cost drivers match the current filters.</td></tr>"}
                      <tr class="total"><td>Total Direct Cost</td><td>${htmlEscape(compactMoney(officialVisibleTotal))}</td><td>100%</td></tr>
                    </tbody>
                  </table>
                  <div class="insight-box"><strong>INSIGHT:</strong> ${htmlEscape(topDriver ? `${topDriver.label} is the largest cost driver at ${compactPercent(topDriverShare)}.` : "No GL driver available.")}</div>
                </div>
              </section>

              <section class="grid-2">
                <div class="panel">
                  <h2>3. Cost Distribution (Visual)</h2>
                  <div class="donut-wrap">
                    <div class="donut"></div>
                    <div>${costLegendRows || "<div style='color:#64748b;font-size:12px;'>No cost distribution available.</div>"}</div>
                  </div>
                </div>

                <div class="panel">
                  <h2>4. Credit Notes (CN Impact - This Cost Center Only)</h2>
                  <table>
                    <thead><tr><th>Source</th><th>Value ($)</th><th>Impact</th></tr></thead>
                    <tbody>
                      ${cnImpactTableRows}
                    </tbody>
                  </table>
                  <div class="insight-box"><strong>INSIGHT:</strong> CNs are internal reallocations and should be tracked separately from operational cost.</div>
                </div>
              </section>

              <section class="grid-2">
                <div class="panel">
                  <h2>5. Profitability Movement</h2>
                  <div class="waterfall">
                    <div class="wf-bar ${grossProfitBeforeCn >= 0 ? "" : "red"}" style="height:${Math.max(16, Math.min(145, Math.abs(grossProfitBeforeCn) / maxFlowReport * 145))}px"><span>${htmlEscape(compactMoney(grossProfitBeforeCn))}</span></div>
                    <div class="wf-bar ${cnCost >= 0 ? "red" : "green"}" style="height:${Math.max(16, Math.min(145, Math.abs(cnCost) / maxFlowReport * 145))}px"><span>${htmlEscape(compactMoney(cnCost))}</span></div>
                    <div class="wf-bar ${netProfit >= 0 ? "" : "red"}" style="height:${Math.max(16, Math.min(145, Math.abs(netProfit) / maxFlowReport * 145))}px"><span>${htmlEscape(compactMoney(netProfit))}</span></div>
                  </div>
                  <div class="wf-labels"><div>Gross Profit<br>Before CN</div><div>CN Impact</div><div>Final Net<br>Profit</div></div>
                </div>

                <div class="panel">
                  <h2>6. Executive Insights (Auto-Generated)</h2>
                  <div class="insights-list">
                    ${insightItems.map((item, index) => `<div><span class="badge ${index === 0 && netProfit < 0 ? "red-bg" : index === 1 ? "orange-bg" : index === 2 ? "blue-bg" : "purple-bg"}">${index + 1}</span><span>${htmlEscape(item)}</span></div>`).join("")}
                    <div><span class="badge teal-bg">5</span><span>${htmlEscape(reportMargin !== null && reportMargin < 0.1 ? "Profitability is low; management review is recommended." : "Profitability is within the current reporting context.")}</span></div>
                  </div>
                </div>
              </section>

              <section class="panel actions">
                <h2>7. Strategic Actions</h2>
                <div class="action-grid">${actionCards}</div>
              </section>
            </div>

            <footer class="footer">
              <span>Prepared from IGCC Financial Portal | Confidential</span>
              <span>${htmlEscape(filters.costCenter)}</span>
            </footer>
          </main>
          <script>
            window.addEventListener("load", () => {
              setTimeout(() => {
                window.focus();
                window.print();
              }, 250);
            });
          </script>
        </body>
      </html>`;

    const reportWindow = window.open("", "_blank", "width=1024,height=768");
    if (!reportWindow) {
      setError("Popup blocked. Please allow popups to print the cost center report.");
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
    reportWindow.focus();
  };
  const renderCostCenterProfitabilityDetail = () => {
    if (!filters.costCenter) return null;

    const bridgeSteps = [
      ["Revenue", selectedCostCenterApproved, theme.accentStrong, "Approved AFP"],
      ["Cost", -officialVisibleTotal, theme.danger, "Spent report"],
      ["CN Impact", cnReceivedTotal - cnIssuedTotal, cnReceivedTotal - cnIssuedTotal >= 0 ? theme.danger : theme.accentStrong, "Received - issued"],
      ["Net Profit", selectedProfitAmount, profitColor(selectedProfitAmount), "Revenue - adjusted cost"],
      ["Margin %", selectedProfitMargin, profitColor(selectedProfitAmount), "Net profit / revenue", "percent"],
    ];
    const summaryMetrics = [];

    return (
      <div style={{ display: "grid", gap: 18 }}>
        <section style={{ border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, background: themeMode === "light" ? "linear-gradient(135deg, #f8fbff 0%, #ffffff 58%, #f0fdfa 100%)" : theme.inputBg, boxShadow: "0 18px 38px rgba(15,23,42,0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 280px), 1fr) minmax(min(100%, 520px), 1.45fr)", gap: 18, alignItems: "center" }}>
            <div>
              <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Cost Center Detail</div>
              <h3 style={{ margin: "8px 0 0", color: theme.text, fontSize: 30, lineHeight: 1.05, fontWeight: 950 }}>{filters.costCenter}</h3>
              <div style={{ marginTop: 9, color: theme.subtext, fontSize: 13, fontWeight: 800 }}>{selectedPeriodLabel}</div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: isAdjustedCostActive ? "#0f766e" : theme.subtext, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{costViewLabel}</span>
                <button
                  type="button"
                  onClick={handlePrintCostCenterReport}
                  style={{ border: "none", borderRadius: 999, padding: "8px 13px", background: "#0f766e", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 950, boxShadow: "0 8px 18px rgba(15,118,110,0.22)" }}
                >
                  Print Cost Center Report
                </button>
              </div>
            </div>
            <div style={{ display: "none", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 10 }}>
              {summaryMetrics.map(([label, value, accent]) => (
                <div key={label} className="executive-hover-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, background: theme.panelBg, transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease" }}>
                  <div style={{ color: theme.subtext, fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 8, color: accent, fontSize: 20, lineHeight: 1.05, fontWeight: 950 }}>{formatCompactCurrency(value)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 14px 30px rgba(15,23,42,0.07)" }}>
          <div style={{ padding: "16px 18px", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>AFP Status</div>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            {[
              ["Submitted AFP", selectedCostCenterSubmitted, "#2563eb"],
              ["Approved AFP", selectedCostCenterApproved, theme.accentStrong],
              ["Approval Gap", selectedApprovalGap, selectedApprovalGap > 0 ? theme.danger : theme.accentStrong],
              ["Approval Rate", selectedApprovalRate, selectedApprovalRate >= 0.85 ? theme.accentStrong : theme.accentWarm],
            ].map(([label, value, accent]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr) 120px", gap: 12, alignItems: "center" }}>
                <span style={{ color: theme.text, fontWeight: 900 }}>{label}</span>
                <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                  <div style={{ width: `${label === "Approval Rate" ? Math.max(3, Math.min(100, selectedApprovalRate * 100)) : Math.max(3, (Math.abs(value) / Math.max(selectedCostCenterSubmitted, selectedCostCenterApproved, Math.abs(selectedApprovalGap), 1)) * 100)}%`, height: "100%", borderRadius: 999, background: accent }} />
                </div>
                <strong style={{ color: accent, textAlign: "right" }}>{label === "Approval Rate" ? formatPercent(value) : formatCompactCurrency(value)}</strong>
              </div>
            ))}
          </div>
        </section>

        {isAdjustedCostActive && (
        <section style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 14px 30px rgba(15,23,42,0.07)" }}>
          <div style={{ padding: "16px 18px", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>Credit Note Flow</div>
          <div style={{ padding: 18, display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 10, alignItems: "center" }}>
              {[
                ["Issued", cnIssuedTotal, theme.danger],
                ["Received", cnReceivedTotal, "#059669"],
                ["Net Impact", cnReceivedTotal - cnIssuedTotal, cnReceivedTotal - cnIssuedTotal >= 0 ? theme.danger : theme.accentStrong],
              ].map(([label, value, accent], index) => (
                <Fragment key={label}>
                  <div style={{ border: `1px solid ${accent}24`, borderRadius: 14, padding: 14, background: `${accent}0d`, textAlign: "center" }}>
                    <div style={{ color: theme.subtext, fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 7, color: accent, fontSize: 20, fontWeight: 950 }}>{formatCompactCurrency(value)}</div>
                  </div>
                  {index < 2 && <div style={{ color: theme.subtext, fontWeight: 950 }}>-&gt;</div>}
                </Fragment>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <h4 style={{ margin: 0, color: theme.text }}>Top Receiving Cost Centers</h4>
              {topCreditReceivingCenters.slice(0, 5).map((row, index) => (
                <div key={row.costCenter} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 100px", gap: 10, alignItems: "center" }}>
                  <strong style={{ color: theme.text }}>{index + 1}. {row.costCenter}</strong>
                  <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(4, (row.cnReceived / (maxTopCreditReceived || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: "#0f766e" }} />
                  </div>
                  <strong style={{ color: "#0f766e", textAlign: "right" }}>{formatCompactCurrency(row.cnReceived)}</strong>
                </div>
              ))}
              {!topCreditReceivingCenters.length && <div style={{ color: theme.subtext }}>No receiving cost centers match the current filters.</div>}
            </div>
          </div>
        </section>
        )}

        <details open style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 14px 30px rgba(15,23,42,0.07)" }}>
          <summary style={{ padding: "16px 18px", cursor: "pointer", listStyle: "none", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>Profit Bridge</summary>
          <div style={{ padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "stretch" }}>
              {bridgeSteps.map(([label, value, accent, detail, type], index) => (
                <Fragment key={label}>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 13, background: theme.panelBg, minWidth: 0, boxSizing: "border-box", overflow: "hidden" }}>
                    <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 8, color: accent, fontSize: 19, lineHeight: 1.05, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{type === "percent" ? (value == null ? "N/A" : formatPercent(value)) : formatCompactCurrency(value)}</div>
                    <div style={{ marginTop: 8, color: theme.subtext, fontSize: 12 }}>{detail}</div>
                  </div>
                  {index < bridgeSteps.length - 1 && <div style={{ alignSelf: "center", justifySelf: "center", color: theme.subtext, fontSize: 18, fontWeight: 950 }}>→</div>}
                </Fragment>
              ))}
            </div>
          </div>
        </details>

        <details open style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 14px 30px rgba(15,23,42,0.07)" }}>
          <summary style={{ padding: "16px 18px", cursor: "pointer", listStyle: "none", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>Cost Drivers</summary>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            {costCenterGlBreakdownRows.slice(0, 10).map((row) => {
              const width = `${Math.max(3, (Math.abs(row.amount) / (maxCostCenterGlAmount || 1)) * 100)}%`;
              const share = officialVisibleTotal ? row.amount / officialVisibleTotal : 0;
              const isTopThree = costCenterGlBreakdownRows.slice(0, 3).some((item) => item.label === row.label);
              return (
                <div key={row.label} className="executive-hover-card" style={{ border: `1px solid ${isTopThree ? theme.accentStrong : theme.border}`, borderRadius: 12, padding: 14, background: theme.panelBg, transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 0.75fr) minmax(0, 1fr) 130px", gap: 14, alignItems: "center" }}>
                    <div>
                      <div style={{ color: theme.text, fontSize: 13, fontWeight: 950, overflowWrap: "anywhere" }}>{row.label}</div>
                      <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{row.rows} entries | {formatPercent(share)}</div>
                    </div>
                    <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width, height: "100%", borderRadius: 999, background: isTopThree ? theme.accentStrong : "#0e7490" }} />
                    </div>
                    <div style={{ textAlign: "right", color: theme.text, fontSize: 13, fontWeight: 950 }}>{formatCurrency(row.amount)}</div>
                  </div>
                </div>
              );
            })}
            {!costCenterGlBreakdownRows.length && <div style={{ color: theme.subtext, fontSize: 13 }}>No GL spend breakdown matches the current filters.</div>}
          </div>
        </details>

        <details style={{ border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 14px 30px rgba(15,23,42,0.07)" }}>
          <summary style={{ padding: "16px 18px", cursor: "pointer", listStyle: "none", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>View Details</summary>
          <div style={{ padding: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Month</th>
                  <th style={leftHeaderStyle}>GL Name</th>
                  <th style={leftHeaderStyle}>Vendor</th>
                  <th style={tableHeaderStyle}>Amount</th>
                  <th style={leftHeaderStyle}>Source</th>
                </tr>
              </thead>
              <tbody>
                {costCenterDetailRows.slice(0, 200).map((row, index) => (
                  <tr key={`${row.id || row.costCenter}-${row.month}-${row.category}-${index}`}>
                    <td style={leftCellStyle}>{row.month}</td>
                    <td style={leftCellStyle}>{row.category || "Uncategorized"}</td>
                    <td style={leftCellStyle}>{row.vendor || "-"}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.amount)}</td>
                    <td style={leftCellStyle}>{row.source || "Spent Report"}</td>
                  </tr>
                ))}
                {!costCenterDetailRows.length && (
                  <tr>
                    <td colSpan={5} style={{ ...leftCellStyle, color: theme.subtext }}>No detail rows match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );
  };
  const portfolioPerformanceRows = portfolioSummaries.map((portfolio) => ({
    ...portfolio,
    gap: portfolio.submitted - portfolio.approved,
    net: portfolio.approved - portfolio.cost,
    margin: portfolio.approved ? (portfolio.approved - portfolio.cost) / portfolio.approved : portfolio.cost ? -1 : 0,
  }));
  const hubPerformanceSummaryRows = hubCostCenterBreakdown
    .map((hub) => ({
      portfolio: getPortfolioForHub(hub.label),
      hub: hub.label,
      cost: hub.amount,
      submitted: hub.submitted,
      approved: hub.approved,
      gap: hub.submitted - hub.approved,
      net: hub.approved - hub.amount,
      margin: hub.approved ? (hub.approved - hub.amount) / hub.approved : hub.amount ? -1 : 0,
      rows: hub.rows,
      centers: hub.centers.length,
    }))
    .filter((row) => row.cost || row.submitted || row.approved)
    .sort((a, b) => b.cost - a.cost);
  const getMetricSummary = (costRows, revenueRows) => {
    const cost = costRows.reduce((sum, item) => sum + item.amount, 0);
    const submitted = revenueRows.filter((item) => item.status === "submitted").reduce((sum, item) => sum + item.amount, 0);
    const approved = revenueRows.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
    const profit = approved - cost;

    return {
      cost,
      submitted,
      approved,
      profit,
      margin: approved ? profit / approved : cost ? -1 : 0,
      rows: costRows.length,
    };
  };
  const getRowsForCenters = (centers) => ({
    costRows: filteredData.filter((item) => centers.includes(item.costCenter)),
    revenueRows: filteredRevenueData.filter((item) => centers.includes(item.costCenter)),
  });
  const getMetricForPeriod = (costRows, revenueRows, periodKey) => {
    const periodCostRows = costRows.filter((item) => getPeriodBucket(item, periodView).key === periodKey);
    const periodRevenueRows = revenueRows.filter((item) => getPeriodBucket(item, periodView).key === periodKey);
    return getMetricSummary(periodCostRows, periodRevenueRows);
  };
  const getGlobalPeriodRowsForCenter = (costCenter) => {
    const costRows = filteredData.filter((item) => item.costCenter === costCenter);
    const revenueRows = filteredRevenueData.filter((item) => item.costCenter === costCenter);
    const label = filters.month || (filters.year ? `Year ${filters.year}` : "Global filter selection");
    const summary = getMetricSummary(costRows, revenueRows);

    return summary.cost || summary.submitted || summary.approved
      ? [{ key: `${filters.month || "all-months"}:${filters.year || "all-years"}`, label, costRows, revenueRows, ...summary }]
      : [];
  };
  const getCostBreakdownRows = (costRows) =>
    Array.from(
      costRows
        .reduce((map, item) => {
          const glName = item.category || "Uncategorized";
          const key = normalizeValue(glName).toLowerCase() || "uncategorized";
          const current = map.get(key) ?? { label: glName, cost: 0, rows: 0 };
          current.cost += item.amount;
          current.rows += 1;
          map.set(key, current);
          return map;
        }, new Map())
        .values()
    ).sort((a, b) => a.label.localeCompare(b.label));
  const profitTimeColumns = periodView === "monthly"
    ? []
    : Array.from(
        [...filteredData, ...filteredRevenueData]
          .reduce((map, item) => {
            const period = getPeriodBucket(item, periodView);
            if (!map.has(period.key)) map.set(period.key, period);
            return map;
          }, new Map())
          .values()
      ).sort((a, b) => a.order - b.order);
  const renderProfitPeriodCell = (costRows, revenueRows, period) => {
    const metric = getMetricForPeriod(costRows, revenueRows, period.key);
    return (
      <div style={{ display: "grid", gap: 3, minWidth: 150 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: theme.subtext, fontSize: 10, fontWeight: 850 }}>Cost</span>
          <strong style={{ color: theme.text, fontSize: 11 }}>{formatCompactCurrency(metric.cost)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: theme.subtext, fontSize: 10, fontWeight: 850 }}>Approved</span>
          <strong style={{ color: theme.accentStrong, fontSize: 11 }}>{formatCompactCurrency(metric.approved)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: theme.subtext, fontSize: 10, fontWeight: 850 }}>Profit</span>
          <strong style={{ color: profitColor(metric.profit), fontSize: 11 }}>{formatCompactCurrency(metric.profit)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: theme.subtext, fontSize: 10, fontWeight: 850 }}>Margin</span>
          <strong style={{ color: profitColor(metric.profit), fontSize: 11 }}>{formatPercent(metric.margin)}</strong>
        </div>
      </div>
    );
  };
  const toggleProfitRow = (key) => {
    setExpandedProfitRows((current) => ({ ...current, [key]: !current[key] }));
  };
  const isProfitRowExpanded = (key) => Boolean(expandedProfitRows[key]);
  const monthlyCommercialRows = aggregateByPeriod(filteredData, "monthly").map((period) => {
    const revenueRows = filteredRevenueData.filter((item) => `${item.year ?? "Unknown"}-${String(item.monthNumber ?? 0).padStart(2, "0")}` === period.key);
    const submitted = revenueRows.filter((item) => item.status === "submitted").reduce((sum, item) => sum + item.amount, 0);
    const approved = revenueRows.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);

    return {
      key: period.key,
      label: period.label,
      order: period.order,
      cost: period.amount,
      submitted,
      approved,
      gap: submitted - approved,
      net: approved - period.amount,
      margin: approved ? (approved - period.amount) / approved : period.amount ? -1 : 0,
    };
  });
  const comparisonMonthlyCommercialRows = aggregateByPeriod(comparisonData, "monthly").map((period) => {
    const revenueRows = comparisonRevenueData.filter((item) => `${item.year ?? "Unknown"}-${String(item.monthNumber ?? 0).padStart(2, "0")}` === period.key);
    const submitted = revenueRows.filter((item) => item.status === "submitted").reduce((sum, item) => sum + item.amount, 0);
    const approved = revenueRows.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);

    return {
      key: period.key,
      label: period.label,
      order: period.order,
      cost: period.amount,
      submitted,
      approved,
      gap: submitted - approved,
      net: approved - period.amount,
      margin: approved ? (approved - period.amount) / approved : period.amount ? -1 : 0,
    };
  });
  const executiveTrendRows = filters.month ? monthlyCommercialRows : comparisonMonthlyCommercialRows;
  const maxTrendValue = Math.max(...executiveTrendRows.flatMap((row) => [Math.abs(row.cost), Math.abs(row.approved)]), 0);
  const chartWidth = 360;
  const chartHeight = 150;
  const chartPadding = 18;
  const getTrendPoint = (row, index, field) => {
    const x = executiveTrendRows.length > 1
      ? chartPadding + (index / (executiveTrendRows.length - 1)) * (chartWidth - chartPadding * 2)
      : chartWidth / 2;
    const y = chartHeight - chartPadding - (Math.abs(row[field]) / (maxTrendValue || 1)) * (chartHeight - chartPadding * 2);

    return `${x},${y}`;
  };
  const costTrendPoints = executiveTrendRows.map((row, index) => getTrendPoint(row, index, "cost")).join(" ");
  const approvedTrendPoints = executiveTrendRows.map((row, index) => getTrendPoint(row, index, "approved")).join(" ");
  const latestTrendRow = executiveTrendRows[executiveTrendRows.length - 1];
  const getMiniTrend = (field, width = 110, height = 44, padding = 5) => {
    const rows = executiveTrendRows.filter((row) => Number.isFinite(Number(row[field])));
    if (!rows.length) return { points: "", latest: null };
    const values = rows.map((row) => Number(row[field]) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(Math.abs(max), 1);
    const points = values.map((value, index) => {
      const x = rows.length > 1
        ? padding + (index / (rows.length - 1)) * (width - padding * 2)
        : width / 2;
      const normalized = max === min ? 0.5 : (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const [latestX, latestY] = points[points.length - 1].split(",");
    return { points: points.join(" "), latest: { x: latestX, y: latestY } };
  };
  const afpTrendRows = filters.month ? monthlyCommercialRows : comparisonMonthlyCommercialRows;
  const approvalCenterRows = [...centerSummaryRows]
    .filter((row) => row.submitted > 0)
    .map((row) => ({
      ...row,
      approvalRate: row.submitted ? row.approved / row.submitted : 0,
    }))
    .sort((a, b) => b.gap - a.gap || a.approvalRate - b.approvalRate);
  const worstApprovalRows = [...approvalCenterRows]
    .sort((a, b) => {
      const noApprovedDelta = Number(b.approved <= 0) - Number(a.approved <= 0);
      return noApprovedDelta || b.gap - a.gap || a.approvalRate - b.approvalRate;
    });
  const commercialRiskRows = approvalCenterRows
    .filter((row) => row.gap > 0 || (row.submitted > 0 && row.approved <= 0))
    .sort((a, b) => {
      const noApprovedDelta = Number(b.approved <= 0 && b.submitted > 0) - Number(a.approved <= 0 && a.submitted > 0);
      return noApprovedDelta || b.gap - a.gap || b.submitted - a.submitted;
    })
    .slice(0, 5);
  const maxAfpGap = Math.max(...afpTrendRows.map((row) => Math.abs(row.gap)), 0);
  const approvalDistributionRows = [
    {
      label: "High",
      range: "85%+",
      count: approvalCenterRows.filter((row) => row.approvalRate >= 0.85).length,
      color: theme.accentStrong,
    },
    {
      label: "Medium",
      range: "60%-84%",
      count: approvalCenterRows.filter((row) => row.approvalRate >= 0.6 && row.approvalRate < 0.85).length,
      color: theme.accentWarm,
    },
    {
      label: "Low",
      range: "<60%",
      count: approvalCenterRows.filter((row) => row.approvalRate < 0.6).length,
      color: theme.danger,
    },
  ];
  const maxApprovalDistribution = Math.max(...approvalDistributionRows.map((row) => row.count), 1);
  const selectedComparisonIndex = filters.month
    ? comparisonMonthlyCommercialRows.findIndex((row) => row.label === filters.month)
    : comparisonMonthlyCommercialRows.length - 1;
  const latestMonthRow = selectedComparisonIndex >= 0 ? comparisonMonthlyCommercialRows[selectedComparisonIndex] : null;
  const previousMonthRow = selectedComparisonIndex > 0 ? comparisonMonthlyCommercialRows[selectedComparisonIndex - 1] : null;
  const getMonthChange = (field) => {
    if (!latestMonthRow || !previousMonthRow) return null;
    const previousValue = previousMonthRow[field] ?? 0;
    const latestValue = latestMonthRow[field] ?? 0;
    const change = latestValue - previousValue;

    return {
      change,
      percent: previousValue ? change / Math.abs(previousValue) : null,
    };
  };
  const getKpiChange = (field, inverse = false) => {
    if (!filters.month) {
      return { text: "All months", arrow: "", color: theme.subtext, muted: true };
    }

    const monthChange = getMonthChange(field);
    if (!monthChange) {
      return { text: "n/a", arrow: "", color: theme.subtext, muted: true };
    }

    const sign = monthChange.change > 0 ? "+" : "";
    const percent = monthChange.percent === null ? "New" : `${sign}${formatPercent(monthChange.percent)}`;
    const isGood = monthChange.change === 0 ? null : inverse ? monthChange.change < 0 : monthChange.change > 0;

    return {
      text: percent,
      arrow: monthChange.change > 0 ? "↑" : monthChange.change < 0 ? "↓" : "→",
      color: isGood === null ? theme.subtext : isGood ? theme.accentStrong : theme.danger,
      muted: false,
    };
  };
  const costByGlRows = Array.from(
    filteredData
      .reduce((map, item) => {
        const glName = item.category || "Uncategorized";
        const current = map.get(glName) ?? { glName, cost: 0, rows: 0 };
        current.cost += item.amount;
        current.rows += 1;
        map.set(glName, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => b.cost - a.cost);
  const maxGlCost = Math.max(...costByGlRows.map((row) => Math.abs(row.cost)), 0);
  const vendorRows = Array.from(
    filteredData
      .reduce((map, item) => {
        const vendor = item.vendor || "Unspecified Vendor";
        const current = map.get(vendor) ?? { vendor, cost: 0, rows: 0 };
        current.cost += item.amount;
        current.rows += 1;
        map.set(vendor, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => b.cost - a.cost);
  const maxVendorCost = Math.max(...vendorRows.slice(0, 10).map((row) => Math.abs(row.cost)), 0);
  const highestCostIncrease = centerSummaryRows
    .map((center) => {
      const rows = aggregateByPeriod(filteredData.filter((item) => item.costCenter === center.costCenter), "monthly").slice(-2);
      const previous = rows[0]?.amount ?? 0;
      const current = rows[1]?.amount ?? rows[0]?.amount ?? 0;
      return { ...center, increase: current - previous, previous, current };
    })
    .filter((row) => row.increase > 0)
    .sort((a, b) => b.increase - a.increase)[0];
  const negativeMarginCenters = centerSummaryRows.filter((row) => row.net < 0).sort((a, b) => a.net - b.net);
  const largeGapCenters = centerSummaryRows.filter((row) => row.gap > 0).sort((a, b) => b.gap - a.gap);
  const hubHistogramRows = hubCostCenterBreakdown
    .filter((hub) => hub.amount)
    .sort((a, b) => b.amount - a.amount);
  const maxHubHistogramAmount = Math.max(...hubHistogramRows.map((hub) => Math.abs(hub.amount)), 0);
  const maxPortfolioCost = Math.max(...portfolioSummaries.map((item) => Math.abs(item.cost)), 0);
  const maxCommercialValue = Math.max(visibleTotal, submittedRevenue, approvedRevenue, 1);
  const donutSubmittedShare = submittedRevenue ? Math.min((approvedRevenue / submittedRevenue) * 100, 100) : 0;
  const portfolioWithCost = portfolioSummaries.filter((portfolio) => portfolio.cost || portfolio.approved || portfolio.submitted);
  const bestPortfolio = [...portfolioWithCost].sort((a, b) => b.recovery - a.recovery)[0];
  const weakestPortfolio = [...portfolioWithCost].sort((a, b) => a.recovery - b.recovery)[0];
  const highestSpendHub = [...hubCostCenterBreakdown].filter((hub) => hub.amount).sort((a, b) => b.amount - a.amount)[0];
  const getCostRevenueBurden = (item) => (item.approved ? item.amount / item.approved : item.amount ? Number.POSITIVE_INFINITY : 0);
  const formatCostRevenueBurden = (item) => {
    if (!item) return "0.0x";
    if (!item.approved && item.amount) return "No approved rev";
    return `${getCostRevenueBurden(item).toFixed(1)}x cost/rev`;
  };
  const sortByCostRevenueBurden = (a, b) =>
    getCostRevenueBurden(b) - getCostRevenueBurden(a) || (b.amount - b.approved) - (a.amount - a.approved) || b.amount - a.amount;
  const highestCostRevenueHub = [...hubCostCenterBreakdown]
    .filter((hub) => hub.amount || hub.approved)
    .sort(sortByCostRevenueBurden)[0];
  const highestCostRevenueCenter = hubCostCenterBreakdown
    .flatMap((hub) => hub.centers.map((center) => ({ ...center, label: center.center, hub: hub.label })))
    .filter((center) => center.amount || center.approved)
    .sort(sortByCostRevenueBurden)[0];
  const netMargin = approvedRevenue ? revenueSurplus / approvedRevenue : visibleTotal ? -1 : 0;
  const approvalRate = submittedRevenue ? approvedRevenue / submittedRevenue : 0;
  const costCoverage = visibleTotal ? approvedRevenue / visibleTotal : 0;
  const topCostDriver = costByGlRows[0];
  const largestPortfolioExposure = [...portfolioPerformanceRows].sort((a, b) => b.cost - a.cost)[0];
  const firstTrendMonth = comparisonMonthlyCommercialRows[0];
  const lastTrendMonth = comparisonMonthlyCommercialRows[comparisonMonthlyCommercialRows.length - 1];
  const overallTrendChange = firstTrendMonth && lastTrendMonth ? lastTrendMonth.cost - firstTrendMonth.cost : 0;
  const overallTrendPercent = firstTrendMonth?.cost ? overallTrendChange / Math.abs(firstTrendMonth.cost) : null;
  const isTrendIncreasing = overallTrendChange > 0;
  const overallStatus =
    visibleTotal > approvedRevenue
      ? { label: "At Risk", icon: "🔴", color: theme.danger, message: "Cost is higher than approved AFP." }
      : netMargin < 0.1
        ? { label: "Attention", icon: "🟡", color: theme.accentWarm, message: "Net position is positive, but margin is low." }
        : { label: "Healthy", icon: "🟢", color: theme.accentStrong, message: "Approved AFP is covering cost with healthy margin." };
  const issueInsights = [
    {
      label: "Highest cost increase",
      icon: "SP",
      value: highestCostIncrease?.hub ?? highestCostIncrease?.costCenter ?? "No increase",
      detail: highestCostIncrease ? `🔴 ${highestCostIncrease.costCenter} increased by ${formatCurrency(highestCostIncrease.increase)} vs previous month` : "🟢 No month-over-month cost increase detected",
      color: theme.accentWarm,
    },
    {
      label: "Approval gap",
      icon: "GAP",
      value: largeGapCenters[0]?.costCenter ?? "No gap",
      detail: largeGapCenters[0] ? `🟡 ${formatCurrency(largeGapCenters[0].gap)} submitted but not approved` : "🟢 No submitted-approved gap in current filter",
      color: "#2563eb",
    },
    {
      label: "Highest risk area",
      icon: "RISK",
      value: highestCostRevenueCenter?.label ?? negativeMarginCenters[0]?.costCenter ?? "No risk area",
      detail: highestCostRevenueCenter
        ? `🔴 ${formatCostRevenueBurden(highestCostRevenueCenter)} in ${highestCostRevenueCenter.hub}`
        : negativeMarginCenters[0]
          ? `🔴 ${formatCurrency(negativeMarginCenters[0].net)} net position`
          : "🟢 No high-risk cost center in current filter",
      color: theme.danger,
    },
  ];
  const summaryInsights = [
    {
      label: "Top cost driver",
      icon: "GL",
      value: topCostDriver?.glName ?? "No GL performance",
      detail: topCostDriver ? formatCompactCurrency(topCostDriver.cost) : "No cost category available",
      color: theme.accentStrong,
    },
    {
      label: "Highest spending hub",
      icon: "HUB",
      value: highestSpendHub?.label ?? "No hub",
      detail: highestSpendHub ? formatCompactCurrency(highestSpendHub.amount) : "No hub cost information available",
      color: theme.accentWarm,
    },
    {
      label: "Largest portfolio exposure",
      icon: "PF",
      value: largestPortfolioExposure?.label ?? "No portfolio",
      detail: largestPortfolioExposure ? formatCompactCurrency(largestPortfolioExposure.cost) : "No portfolio cost available",
      color: largestPortfolioExposure?.accent ?? theme.accentStrong,
    },
    {
      label: "Overall cost trend",
      icon: isTrendIncreasing ? "UP" : overallTrendChange < 0 ? "DN" : "FLAT",
      value: isTrendIncreasing ? "Increasing" : overallTrendChange < 0 ? "Decreasing" : "Flat",
      detail: firstTrendMonth && lastTrendMonth
        ? `${firstTrendMonth.label} to ${lastTrendMonth.label}: ${overallTrendPercent === null ? formatCompactCurrency(overallTrendChange) : formatPercent(overallTrendPercent)}`
        : "No monthly trend available",
      color: isTrendIncreasing ? theme.danger : overallTrendChange < 0 ? theme.accentStrong : theme.subtext,
    },
  ];
  const keyInsights = filters.month ? issueInsights : summaryInsights;
  const executiveScopeLabel = filters.costCenter || filters.hub || filters.portfolio || "All Portfolios";
  const strategicInsightTitle = `Strategic Insights - ${executiveScopeLabel}`;
  const trendLookbackRows = comparisonMonthlyCommercialRows.slice(-3);
  const trendStart = trendLookbackRows[0];
  const trendEnd = trendLookbackRows[trendLookbackRows.length - 1];
  const costTrendDelta = trendStart && trendEnd ? trendEnd.cost - trendStart.cost : 0;
  const costTrendRate = trendStart?.cost ? costTrendDelta / Math.abs(trendStart.cost) : null;
  const costTrendState = Math.abs(costTrendRate ?? costTrendDelta) < 0.03 ? "Stable" : costTrendDelta > 0 ? "Increasing" : "Decreasing";
  const topFilteredCostCenter = Array.from(
    filteredData
      .reduce((map, item) => {
        const key = item.costCenter || "Unmapped";
        map.set(key, (map.get(key) || 0) + (Number(item.amount) || 0));
        return map;
      }, new Map())
      .entries()
  ).sort((a, b) => b[1] - a[1])[0];
  const topFilteredHub = Array.from(
    filteredData
      .reduce((map, item) => {
        const key = resolveHub(item);
        map.set(key, (map.get(key) || 0) + (Number(item.amount) || 0));
        return map;
      }, new Map())
      .entries()
  ).sort((a, b) => b[1] - a[1])[0];
  const topFilteredPortfolio = Array.from(
    filteredData
      .reduce((map, item) => {
        const key = resolvePortfolio(item);
        map.set(key, (map.get(key) || 0) + (Number(item.amount) || 0));
        return map;
      }, new Map())
      .entries()
  ).sort((a, b) => b[1] - a[1])[0];
  const topContributor = filters.costCenter
    ? [topCostDriver?.glName, topCostDriver?.cost, "GL driver"]
    : filters.hub
      ? [topFilteredCostCenter?.[0], topFilteredCostCenter?.[1], "Cost center"]
      : filters.portfolio
        ? [topFilteredHub?.[0], topFilteredHub?.[1], "Hub"]
        : [topFilteredPortfolio?.[0], topFilteredPortfolio?.[1], "Portfolio"];
  const executiveSummaryItems = [
    {
      label: "Cost Trend",
      value: costTrendState,
      detail: trendStart && trendEnd
        ? `${trendStart.label} to ${trendEnd.label}: ${costTrendRate === null ? formatCompactCurrency(costTrendDelta) : formatPercent(costTrendRate)}`
        : "No monthly trend available",
      color: costTrendDelta > 0 ? theme.danger : costTrendDelta < 0 ? theme.accentStrong : theme.subtext,
    },
    {
      label: "Top Cost Driver",
      value: topCostDriver?.glName ?? "No GL driver",
      detail: topCostDriver ? `${formatCompactCurrency(topCostDriver.cost)} (${formatPercent(visibleTotal ? topCostDriver.cost / visibleTotal : 0)} of cost)` : "No GL cost data",
      color: theme.accentStrong,
    },
    {
      label: "Highest Contributor",
      value: topContributor[0] || "No contributor",
      detail: topContributor[1] ? `${topContributor[2]} contributing ${formatCompactCurrency(topContributor[1])}` : "No contribution in current filters",
      color: "#2563eb",
    },
    {
      label: "Portfolio Exposure",
      value: largestPortfolioExposure?.label ?? "No portfolio",
      detail: largestPortfolioExposure ? `${formatCompactCurrency(largestPortfolioExposure.cost)} selected cost exposure` : "No portfolio exposure",
      color: largestPortfolioExposure?.accent ?? theme.accentWarm,
    },
    ...(isAdjustedCostActive
      ? [{
          label: "CN Impact",
          value: cnNetImpact >= 0 ? "Adds Cost" : "Reduces Cost",
          detail: topCreditReceivingCenters[0]
            ? `Net ${formatCompactCurrency(cnNetImpact)}; top receiver ${topCreditReceivingCenters[0].costCenter}`
            : `Net ${formatCompactCurrency(cnNetImpact)}`,
          color: cnNetImpact >= 0 ? theme.danger : theme.accentStrong,
        }]
      : []),
  ].slice(0, 5);
  const dynamicStrategicInsights = [
    {
      label: "Top cost driver",
      icon: "GL",
      value: topCostDriver?.glName ?? "No GL performance",
      detail: topCostDriver ? `${formatCompactCurrency(topCostDriver.cost)} (${formatPercent(visibleTotal ? topCostDriver.cost / visibleTotal : 0)})` : "No cost category available",
      color: theme.accentStrong,
    },
    {
      label: filters.costCenter ? "Cost center focus" : filters.hub ? "Highest center" : filters.portfolio ? "Highest hub" : "Highest portfolio",
      icon: "TOP",
      value: topContributor[0] || "No contributor",
      detail: topContributor[1] ? formatCompactCurrency(topContributor[1]) : "No cost contribution available",
      color: "#2563eb",
    },
    {
      label: "Largest exposure",
      icon: "EXP",
      value: filters.costCenter ? (filters.costCenter || "No center") : largestPortfolioExposure?.label ?? "No portfolio",
      detail: filters.costCenter ? formatCompactCurrency(visibleTotal) : largestPortfolioExposure ? formatCompactCurrency(largestPortfolioExposure.cost) : "No exposure",
      color: largestPortfolioExposure?.accent ?? theme.accentWarm,
    },
    {
      label: "Trend",
      icon: costTrendState === "Increasing" ? "UP" : costTrendState === "Decreasing" ? "DN" : "FLAT",
      value: costTrendState,
      detail: trendStart && trendEnd ? `${trendStart.label} to ${trendEnd.label}` : "No trend available",
      color: costTrendDelta > 0 ? theme.danger : costTrendDelta < 0 ? theme.accentStrong : theme.subtext,
    },
    ...(isAdjustedCostActive
      ? [{
          label: "CN adjusted view",
          icon: "CN",
          value: formatCompactCurrency(cnNetImpact),
          detail: "Adjusted Cost = Spent + received - issued",
          color: cnNetImpact >= 0 ? theme.danger : theme.accentStrong,
        }]
      : []),
  ];
  const insightContextLabel = filters.month ? `Monthly Insights - ${filters.month}` : strategicInsightTitle;
  const largestApprovalGapHub = [...hubCostCenterBreakdown]
    .map((hub) => ({ ...hub, approvalGap: hub.submitted - hub.approved }))
    .filter((hub) => hub.approvalGap > 0)
    .sort((a, b) => b.approvalGap - a.approvalGap)[0];
  const lowestRecoveryHub = [...hubCostCenterBreakdown]
    .filter((hub) => hub.amount || hub.approved)
    .map((hub) => ({ ...hub, recovery: hub.amount ? hub.approved / hub.amount : 0 }))
    .sort((a, b) => a.recovery - b.recovery)[0];
  const commercialHealth =
    revenueSurplus < 0
      ? { label: "Critical", color: theme.danger, message: "Approved revenue is below selected cost." }
      : approvalGap > approvedRevenue * 0.08
        ? { label: "Watch", color: theme.accentWarm, message: "Submitted AFP has material value pending approval." }
        : { label: "Strong", color: theme.accentStrong, message: "Approved revenue is covering the selected cost base." };
  const executiveInsight = approvedRevenue
    ? `Approved revenue covers ${formatPercent(recoveryRatio)} of selected cost, with ${highestSpendHub?.label ?? "no hub"} carrying the largest cost exposure.`
    : "No approved revenue is available for the current selection.";
  const lastUpdatedLabel = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const portalUserName = session?.email?.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "IGCC User";
  const portalTotalCost = data.reduce((sum, item) => sum + item.amount, 0);
  const portalApprovedAfp = revenueData.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
  const portalNetPosition = portalApprovedAfp - portalTotalCost;
  const portalCards = [
    ["Net Position", formatCompactCurrency(portalNetPosition), portalNetPosition >= 0 ? "Approved AFP above total cost" : "Cost exceeds approved AFP", portalNetPosition >= 0 ? "#059669" : "#dc2626", "NP"],
    ["Total Cost", formatCompactCurrency(portalTotalCost), "Cumulative spent report cost", "#2563eb", "TC"],
    ["Approved AFP", formatCompactCurrency(portalApprovedAfp), "Recognized approved AFP value", "#16a34a", "AF"],
    ["Last Updated", lastUpdatedLabel, "Dashboard refresh timestamp", "#7c3aed", "LU"],
  ];
  const portalNavigationCards = [
    ["overview", "Executive Cockpit", "Executive KPIs, portfolio exposure, performance direction, and financial position.", "EC", "#0f766e", "line"],
    ["afp", "Commercial Approval Overview", "AFP submission, approval gaps, commercial issues, and approval distribution.", "AFP", "#2563eb", "bars"],
    ["profitability", "Cost Center Profitability", "Portfolio-to-cost-center profitability drilldown and GL-level detail.", "P&L", "#16a34a", "pie"],
    ["spent", "Spent Report", "Historical spend summary and filtered transaction-level cost records.", "SR", "#dc2626", "doc"],
  ];
  const portalInfoStrip = [
    ["Secure Access", "Role-based access and data protection", "SA", "#14b8a6"],
    ["Real-time Data", "Always updated with latest financial data", "RT", "#2563eb"],
    ["Data Integrity", "Validated and verified financial information", "DI", "#22c55e"],
    ["Multi-portfolio", "Consolidated view across all portfolios and hubs", "MP", "#8b5cf6"],
  ];
  const isAdmin = session?.role === "Admin";
  const visibleNavItems = [["home", "Home"], ...NAV_ITEMS, ["spent", "Spent Report"]];
  const navIcons = { home: "HM", overview: "EC", afp: "AFP", profitability: "P&L", spent: "SR" };
  const trendChange = getMonthChange("cost");
  const trendDirection = !trendChange || Math.abs(trendChange.change) < 1
    ? "Stable"
    : trendChange.change > 0
      ? "Increasing"
      : "Decreasing";
  const trendDetail = trendChange
    ? `${latestMonthRow?.label ?? "Latest"} vs ${previousMonthRow?.label ?? "previous"}: ${trendChange.percent === null ? formatCompactCurrency(trendChange.change) : formatPercent(trendChange.percent)}`
    : "No prior period available";
  const trendColor = trendChange?.change > 0 ? theme.danger : trendChange?.change < 0 ? theme.accentStrong : theme.subtext;
  const portalInsights = [
    { label: "Cost Trend", value: trendDirection, detail: trendDetail, color: trendColor },
    { label: "Top Cost Driver", value: topCostDriver?.glName ?? "No driver", detail: topCostDriver ? formatCompactCurrency(topCostDriver.cost) : "No cost data", color: theme.accentStrong },
    { label: "Portfolio Exposure", value: largestPortfolioExposure?.label ?? "No portfolio", detail: largestPortfolioExposure ? formatCompactCurrency(largestPortfolioExposure.cost) : "No exposure", color: largestPortfolioExposure?.accent ?? "#2563eb" },
    { label: "Commercial Position", value: portalNetPosition >= 0 ? "Positive" : "At Risk", detail: formatCompactCurrency(portalNetPosition), color: portalNetPosition >= 0 ? theme.accentStrong : theme.danger },
  ];
  const afpInsights = [
    { label: "Approval Trend", value: approvalRate >= 0.85 ? "Strong" : approvalRate >= 0.6 ? "Watch" : "At Risk", detail: `${formatPercent(approvalRate)} approval rate`, color: approvalRate >= 0.85 ? theme.accentStrong : approvalRate >= 0.6 ? theme.accentWarm : theme.danger },
    { label: "Largest Gap", value: worstApprovalRows[0]?.costCenter ?? "No gap", detail: worstApprovalRows[0] ? formatCompactCurrency(worstApprovalRows[0].gap) : "No pending gap", color: worstApprovalRows[0]?.gap > 0 ? theme.danger : theme.accentStrong },
    { label: "Commercial Issue", value: commercialRiskRows[0]?.costCenter ?? "No issue", detail: commercialRiskRows[0] ? `${formatPercent(commercialRiskRows[0].approvalRate)} approved` : "No open issue", color: commercialRiskRows[0] ? theme.accentWarm : theme.accentStrong },
    { label: "Pipeline Value", value: formatCompactCurrency(submittedRevenue), detail: `${formatCompactCurrency(approvedRevenue)} approved`, color: "#2563eb" },
  ];
  const profitabilityInsights = [
    { label: "Net Position", value: revenueSurplus >= 0 ? "Positive" : "At Risk", detail: formatCompactCurrency(revenueSurplus), color: profitColor(revenueSurplus) },
    { label: "At Risk Center", value: riskProfitabilityRow?.costCenter ?? "No risk", detail: riskProfitabilityRow ? formatCompactCurrency(riskProfitabilityRow.approvedNet) : "No center exposure", color: riskProfitabilityRow?.approvedNet < 0 ? theme.danger : theme.accentStrong },
    { label: "Best Center", value: bestProfitabilityRow?.costCenter ?? "No data", detail: bestProfitabilityRow ? formatCompactCurrency(bestProfitabilityRow.approvedNet) : "No center data", color: "#2563eb" },
    { label: "Positive Coverage", value: `${positiveProfitabilityCount}/${profitabilityRows.length || 0}`, detail: "Centers with positive approved position", color: theme.accentStrong },
  ];
  const selectedApprovalGap = selectedCostCenterSubmitted - selectedCostCenterApproved;
  const selectedApprovalRate = selectedCostCenterSubmitted ? selectedCostCenterApproved / selectedCostCenterSubmitted : 0;
  const selectedProfitCostBase = isAdjustedCostActive ? adjustedCostPreviewTotal : officialVisibleTotal;
  const selectedProfitAmount = selectedCostCenterApproved - selectedProfitCostBase;
  const selectedProfitMargin = selectedCostCenterApproved ? selectedProfitAmount / selectedCostCenterApproved : selectedProfitCostBase ? -1 : null;
  const selectedTopCostDriver = costCenterGlBreakdownRows[0];
  const profitabilityTrendRows = filters.costCenter ? comparisonMonthlyCommercialRows.slice(-3) : monthlyCommercialRows.slice(-3);
  const profitabilityTrendStart = profitabilityTrendRows[0];
  const profitabilityTrendEnd = profitabilityTrendRows[profitabilityTrendRows.length - 1];
  const profitabilityTrendDelta = profitabilityTrendStart && profitabilityTrendEnd ? profitabilityTrendEnd.net - profitabilityTrendStart.net : 0;
  const profitabilityTrendLabel = Math.abs(profitabilityTrendDelta) < 1 ? "Stable" : profitabilityTrendDelta > 0 ? "Improving" : "Weakening";
  const profitSummaryInsights = [
    {
      label: "Profit Status",
      icon: "PS",
      value: (filters.costCenter ? selectedProfitAmount : revenueSurplus) >= 0 ? "Positive" : "Negative",
      detail: formatCompactCurrency(filters.costCenter ? selectedProfitAmount : revenueSurplus),
      color: profitColor(filters.costCenter ? selectedProfitAmount : revenueSurplus),
    },
    {
      label: "Approval Status",
      icon: "AFP",
      value: formatPercent(filters.costCenter ? selectedApprovalRate : approvalRate),
      detail: `Gap ${formatCompactCurrency(filters.costCenter ? selectedApprovalGap : approvalGap)}`,
      color: (filters.costCenter ? selectedApprovalRate : approvalRate) >= 0.85 ? theme.accentStrong : theme.accentWarm,
    },
    {
      label: "Top Cost Driver",
      icon: "GL",
      value: (filters.costCenter ? selectedTopCostDriver?.label : topCostDriver?.glName) ?? "No GL driver",
      detail: filters.costCenter && selectedTopCostDriver
        ? `${formatCompactCurrency(selectedTopCostDriver.amount)} (${formatPercent(officialVisibleTotal ? selectedTopCostDriver.amount / officialVisibleTotal : 0)})`
        : topCostDriver ? `${formatCompactCurrency(topCostDriver.cost)} (${formatPercent(visibleTotal ? topCostDriver.cost / visibleTotal : 0)})` : "No cost driver",
      color: "#2563eb",
    },
    ...(isAdjustedCostActive
      ? [{
          label: "CN Impact",
          icon: "CN",
          value: formatCompactCurrency(cnNetImpact),
          detail: cnNetImpact >= 0 ? "Adds to adjusted cost" : "Reduces adjusted cost",
          color: cnNetImpact >= 0 ? theme.danger : theme.accentStrong,
        }]
      : []),
    {
      label: "Trend",
      icon: "TR",
      value: profitabilityTrendLabel,
      detail: profitabilityTrendStart && profitabilityTrendEnd ? `${profitabilityTrendStart.label} to ${profitabilityTrendEnd.label}` : "No trend available",
      color: profitabilityTrendDelta >= 0 ? theme.accentStrong : theme.danger,
    },
  ].slice(0, 5);
  const profitabilityScopeType = filters.costCenter ? "Cost Center" : filters.hub ? "Hub" : "Portfolio";
  const profitabilityScopeName = filters.costCenter || filters.hub || filters.portfolio || "All Portfolios";
  const profitabilityPeriodRows = [...filteredOfficialData, ...filteredRevenueData, ...filteredCreditNoteData]
    .filter((item) => item.year && item.monthNumber)
    .map((item) => ({ year: Number(item.year), monthNumber: Number(item.monthNumber) }))
    .sort((a, b) => a.year - b.year || a.monthNumber - b.monthNumber);
  const profitabilityFirstPeriod = profitabilityPeriodRows[0];
  const profitabilityLastPeriod = profitabilityPeriodRows[profitabilityPeriodRows.length - 1];
  const formatProfitabilityPeriod = (period) => period ? `${MONTH_LABELS[period.monthNumber]} ${period.year}` : "";
  const profitabilityPeriodLabel = profitabilityFirstPeriod && profitabilityLastPeriod
    ? profitabilityFirstPeriod.year === profitabilityLastPeriod.year && profitabilityFirstPeriod.monthNumber === profitabilityLastPeriod.monthNumber
      ? formatProfitabilityPeriod(profitabilityFirstPeriod)
      : `${formatProfitabilityPeriod(profitabilityFirstPeriod)} - ${formatProfitabilityPeriod(profitabilityLastPeriod)}`
    : `${filters.month || "All months"} | ${filters.year || "All years"}`;
  const profitabilityDirectCost = officialVisibleTotal;
  const profitabilityAppliedCnImpact = isAdjustedCostActive ? cnNetImpact : 0;
  const profitabilityCnImpactTotal = cnNetImpact;
  const profitabilityTotalCost = profitabilityDirectCost + profitabilityAppliedCnImpact;
  const profitabilityGrossBeforeCn = approvedRevenue - profitabilityDirectCost;
  const profitabilityNetProfit = approvedRevenue - profitabilityTotalCost;
  const profitabilityCnProfitImpact = -profitabilityAppliedCnImpact;
  const profitabilityMargin = approvedRevenue ? profitabilityNetProfit / approvedRevenue : profitabilityTotalCost ? -1 : 0;
  const profitabilityApprovalGap = Math.max(submittedRevenue - approvedRevenue, 0);
  const profitabilityRevenueMax = Math.max(submittedRevenue, approvedRevenue, profitabilityApprovalGap, 1);
  const profitabilityGlRows = Array.from(
    filteredOfficialData
      .reduce((map, item) => {
        const glName = item.category || "Uncategorized";
        const current = map.get(glName) ?? { glName, amount: 0, rows: 0 };
        current.amount += Number(item.amount) || 0;
        current.rows += 1;
        map.set(glName, current);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => b.amount - a.amount);
  const profitabilityTopGlRows = profitabilityGlRows.slice(0, 6);
  const profitabilityTopDriver = profitabilityTopGlRows[0];
  const profitabilityCostGroupDefinitions = [
    { key: "manpower", label: "Manpower", color: "#0f5fb8", match: (name) => /manpower|staff|salary|compensation/i.test(name) },
    { key: "materials", label: "Materials & Supplies", color: "#16a34a", match: (name) => /material|suppl/i.test(name) },
    { key: "equipment", label: "Equipment Rental", color: "#f59e0b", match: (name) => /equipment|rental|lease/i.test(name) },
    { key: "subcontract", label: "Subcontractor", color: "#7c3aed", match: (name) => /subcontract/i.test(name) },
    { key: "others", label: "Others", color: "#14b8a6", match: () => true },
  ];
  const profitabilityDistributionMap = profitabilityCostGroupDefinitions.reduce((map, definition) => {
    map.set(definition.key, { ...definition, amount: 0 });
    return map;
  }, new Map());
  profitabilityGlRows.forEach((row) => {
    const group = profitabilityCostGroupDefinitions.find((definition) => definition.key !== "others" && definition.match(row.glName)) ?? profitabilityCostGroupDefinitions[profitabilityCostGroupDefinitions.length - 1];
    profitabilityDistributionMap.get(group.key).amount += row.amount;
  });
  const profitabilityDistributionRows = Array.from(profitabilityDistributionMap.values()).filter((row) => row.amount || row.key !== "others");
  const profitabilityCnCategoryOrder = ["workshop", "scaffolding", "store", "fa"];
  const profitabilityCnCategoryLabels = {
    fa: "FA",
    store: "Store",
    scaffolding: "Scaffolding",
    workshop: "Workshop",
  };
  const profitabilityCnImpactLabels = {
    workshop: "Cost Reduction",
    scaffolding: "Cost Adjustment",
    store: "Material Return",
    fa: "Asset Adjustment",
  };
  const profitabilityCnRows = profitabilityCnCategoryOrder.map((categoryKey) => {
    const matchingRows = filteredCreditNoteData.filter((item) => normalizeCreditNoteCategory(item.category) === categoryKey);
    const received = matchingRows.reduce((sum, item) => sum + (Number(item.cnReceived) || 0), 0);
    const issued = matchingRows.reduce((sum, item) => sum + (Number(item.cnIssued) || 0), 0);
    return {
      key: categoryKey,
      label: profitabilityCnCategoryLabels[categoryKey],
      impact: profitabilityCnImpactLabels[categoryKey],
      received,
      issued,
      net: received - issued,
    };
  });
  let profitabilityDistributionCursor = 0;
  const profitabilityDistributionStops = profitabilityDistributionRows.length
    ? profitabilityDistributionRows.map((row) => {
        const share = profitabilityDirectCost ? Math.max((row.amount / profitabilityDirectCost) * 100, 0) : 0;
        const start = profitabilityDistributionCursor;
        profitabilityDistributionCursor += share;
        return `${row.color} ${start}% ${profitabilityDistributionCursor}%`;
      }).join(", ")
    : "#e2e8f0 0% 100%";
  const profitabilityMovementRows = [
    { label: "Gross Profit Before CN", value: profitabilityGrossBeforeCn, color: "#0f5fb8" },
    { label: "CN Impact", value: profitabilityCnProfitImpact, color: profitabilityCnProfitImpact >= 0 ? theme.accentStrong : theme.danger },
    { label: "Final Gross Profit", value: profitabilityNetProfit, color: profitColor(profitabilityNetProfit) },
  ];
  const profitabilityMovementMax = Math.max(...profitabilityMovementRows.map((row) => Math.abs(row.value)), 1);
  const profitabilityDashboardInsights = [
    {
      label: "Profitability Status",
      detail: profitabilityNetProfit >= 0
        ? `${profitabilityScopeName} is profitable with ${formatCompactCurrency(profitabilityNetProfit)} net profit (${formatPercent(profitabilityMargin)}).`
        : `${profitabilityScopeName} is below breakeven by ${formatCompactCurrency(Math.abs(profitabilityNetProfit))} (${formatPercent(profitabilityMargin)}).`,
      color: profitColor(profitabilityNetProfit),
    },
    {
      label: "Main Cost Driver",
      detail: profitabilityTopDriver
        ? `${profitabilityTopDriver.glName} is the largest cost driver at ${formatCompactCurrency(profitabilityTopDriver.amount)} (${formatPercent(profitabilityDirectCost ? profitabilityTopDriver.amount / profitabilityDirectCost : 0)}).`
        : "No cost driver is available for the selected scope.",
      color: "#0f5fb8",
    },
    {
      label: "Credit Note Impact",
      detail: isAdjustedCostActive
        ? `Credit notes ${profitabilityCnImpactTotal >= 0 ? "increase" : "reduce"} cost by ${formatCompactCurrency(Math.abs(profitabilityCnImpactTotal))}.`
        : `CN net impact is ${formatCompactCurrency(profitabilityCnImpactTotal)} and is shown separately in Official Cost view.`,
      color: isAdjustedCostActive ? (profitabilityCnImpactTotal >= 0 ? theme.danger : theme.accentStrong) : theme.subtext,
    },
    {
      label: "AFP Gap Impact",
      detail: profitabilityApprovalGap > 0
        ? `${formatCompactCurrency(profitabilityApprovalGap)} remains pending; approval rate is ${formatPercent(approvalRate)}.`
        : `AFP is fully approved at ${formatPercent(approvalRate)} approval rate.`,
      color: profitabilityApprovalGap > 0 ? theme.accentWarm : theme.accentStrong,
    },
    {
      label: "Margin Quality",
      detail: profitabilityMargin < 0
        ? "Margin is negative and requires immediate commercial recovery action."
        : profitabilityMargin < 0.1
          ? "Reported margin is positive but thin; operational margin should be protected."
          : "Margin quality is healthy for the selected scope.",
      color: profitabilityMargin < 0.1 ? theme.accentWarm : theme.accentStrong,
    },
  ];
  const profitabilityStrategicActions = [
    profitabilityApprovalGap > 0
      ? ["Accelerate AFP approval", "Reduce pending approval value to protect cash flow.", "#0f5fb8", "AFP"]
      : ["Maintain approval discipline", "Keep submitted and approved AFP aligned.", theme.accentStrong, "OK"],
    profitabilityTopDriver
      ? [`Review ${profitabilityTopDriver.glName}`, "Challenge the largest GL driver and confirm it matches execution need.", "#f59e0b", "GL"]
      : ["Validate cost coding", "Confirm costs are mapped to clear GL drivers.", "#f59e0b", "GL"],
    Math.abs(profitabilityCnImpactTotal) > 0
      ? ["Track CN separately", "Keep credit notes visible as internal reallocation, not operating performance.", "#7c3aed", "CN"]
      : ["Monitor CN exposure", "Watch issued and received CN movement by scope.", "#7c3aed", "CN"],
    profitabilityMargin < 0.1
      ? ["Protect margin", "Target high-cost GL categories and review commercial recovery.", theme.danger, "MG"]
      : ["Scale profitable work", "Use the current scope as a benchmark for stronger recovery.", theme.accentStrong, "MG"],
  ];
  const spentInsights = [
    { label: "Total Spend", value: formatCompactCurrency(spentTotalAmount), detail: `${filteredData.length.toLocaleString()} records in view`, color: theme.accentStrong },
    { label: "Top GL Driver", value: topSpentGl?.[0] || "No data", detail: topSpentGl ? formatCompactCurrency(topSpentGl[1]) : "No GL cost", color: "#2563eb" },
    { label: "Top Cost Center", value: topSpentCostCenter?.[0] || "No data", detail: topSpentCostCenter ? formatCompactCurrency(topSpentCostCenter[1]) : "No center cost", color: theme.accentWarm },
    { label: "Period Coverage", value: `${spentMonthCount}`, detail: "Months included in current view", color: "#7c3aed" },
  ];
  const renderExecutiveInsights = (title, insights) => (
    <section style={{ marginBottom: 18, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16, background: themeMode === "light" ? "linear-gradient(135deg, #f8fbff 0%, #ffffff 48%, #ecfdf5 100%)" : theme.panelBg, boxShadow: "0 16px 36px rgba(15,23,42,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ color: theme.accentStrong, fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.5 }}>Auto-Generated Executive Narrative</div>
          <h3 style={{ margin: "4px 0 0", color: theme.text, fontSize: 20, fontWeight: 950 }}>{title}</h3>
        </div>
        <span style={{ color: theme.accentStrong, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>Updates with current filters</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {insights.slice(0, 5).map((insight, index) => (
          <div key={`${insight.label}-${index}`} className="executive-hover-card" style={{ border: `1px solid ${theme.border}`, borderLeft: `4px solid ${insight.color}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.08)", transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{insight.label}</div>
                <div style={{ marginTop: 7, color: insight.color, fontSize: 20, lineHeight: 1.1, fontWeight: 950, overflowWrap: "anywhere" }}>{insight.value}</div>
                <div style={{ marginTop: 9, color: theme.subtext, fontSize: 12, lineHeight: 1.4 }}>{insight.detail}</div>
              </div>
              <span style={{ display: "grid", placeItems: "center", minWidth: 32, height: 32, borderRadius: 10, background: `${insight.color}14`, color: insight.color, fontSize: 11, fontWeight: 950 }}>{index + 1}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="dashboard-shell" style={{ minHeight: "100vh", padding: "8px 16px 28px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 1280, margin: "0 auto", color: theme.text, background: themeMode === "light" ? "linear-gradient(180deg, #eef5fb 0%, #f8fbff 42%, #ffffff 100%)" : theme.pageBg }}>
      <style>{`
        .ceo-pnl-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(15, 118, 110, 0.38) rgba(226, 232, 240, 0.52);
          scroll-behavior: smooth;
        }
        .ceo-pnl-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .ceo-pnl-scroll::-webkit-scrollbar-track {
          background: rgba(226, 232, 240, 0.48);
          border-radius: 999px;
        }
        .ceo-pnl-scroll::-webkit-scrollbar-thumb {
          background: rgba(15, 118, 110, 0.34);
          border-radius: 999px;
          border: 2px solid rgba(248, 250, 252, 0.9);
        }
        .ceo-pnl-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(15, 118, 110, 0.52);
        }
        .ceo-pnl-row {
          transition: background 140ms ease, transform 140ms ease, box-shadow 140ms ease;
        }
        .ceo-pnl-row:hover {
          background: rgba(240, 253, 250, 0.72) !important;
          box-shadow: inset 3px 0 0 rgba(15, 118, 110, 0.55);
        }
      `}</style>
      {showWelcome && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: themeMode === "light" ? "rgba(15, 23, 42, 0.42)" : "rgba(2, 6, 23, 0.68)" }}>
          <div style={{ width: "min(620px, 100%)", overflow: "hidden", borderRadius: 8, background: theme.panelBg, border: `1px solid ${theme.border}`, boxShadow: "0 24px 70px rgba(15,23,42,0.28)" }}>
            <div style={{ padding: 22, color: "#fff", background: "linear-gradient(135deg, #0f766e, #12324f)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.82, textTransform: "uppercase" }}>Welcome to IGCC Financial Dashboard</div>
              <h2 style={{ margin: "10px 0 0", color: "#fff", fontSize: 28, fontWeight: 950, letterSpacing: 0 }}>IRAQ GATE CONTRACTING COMPANY</h2>
              <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.86)", fontSize: 16, lineHeight: 1.5 }}>{WELCOME_MESSAGE}</p>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={enterDashboard}
                  style={{ border: "none", borderRadius: 8, padding: "11px 18px", cursor: "pointer", background: theme.accentStrong, color: "#fff", fontWeight: 900 }}
                >
                  Enter Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isUserMenuOpen && (
        <div
          onClick={() => {
            setIsUserMenuOpen(false);
            setActiveUserModal("");
          }}
          style={{ position: "fixed", inset: 0, zIndex: 55, background: themeMode === "light" ? "rgba(15,23,42,0.28)" : "rgba(2,6,23,0.62)", display: "flex", justifyContent: "flex-end" }}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(380px, 92vw)", height: "100%", background: theme.panelBg, borderLeft: `1px solid ${theme.border}`, boxShadow: "-28px 0 70px rgba(15,23,42,0.28)", padding: 22, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", borderBottom: `1px solid ${theme.border}`, paddingBottom: 16 }}>
              <div>
                <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Account</div>
                <h3 style={{ margin: "5px 0 0", color: theme.text, fontSize: 20, fontWeight: 950 }}>{portalUserName}</h3>
                <div style={{ marginTop: 5, color: theme.subtext, fontSize: 12 }}>{session?.role ?? "Viewer"} | Last updated: {lastUpdatedLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setActiveUserModal("");
                }}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.inputBg, color: theme.text, width: 34, height: 32, cursor: "pointer", fontWeight: 950 }}
              >
                x
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["profile", "Profile / Personal Info", "User email, role, access, and approval status"],
                ["login", "Login Info", "Last login and current access type"],
                ["contact", "Contact Us", "System owner and support information"],
                ["settings", "Settings", "Dashboard preferences and access settings"],
              ].map(([key, label, note]) => (
                <button
                  key={key}
                  type="button"
                  onMouseEnter={() => setActiveUserModal(key)}
                  onMouseOver={() => setActiveUserModal(key)}
                  onFocus={() => setActiveUserModal(key)}
                  onClick={() => setActiveUserModal(key)}
                  style={{ width: "100%", border: `1px solid ${activeUserModal === key ? theme.accentStrong : theme.border}`, borderRadius: 14, padding: "12px 14px", background: activeUserModal === key ? theme.accentSoft : themeMode === "light" ? "#ffffff" : theme.inputBg, color: theme.text, textAlign: "left", cursor: "pointer", boxShadow: "0 10px 22px rgba(15,23,42,0.06)" }}
                >
                  <strong style={{ display: "block", fontSize: 14 }}>{label}</strong>
                  <span style={{ display: "block", marginTop: 4, color: theme.subtext, fontSize: 12, lineHeight: 1.35 }}>{note}</span>
                </button>
              ))}
            </div>

            {activeUserModal ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 18px", background: theme.accentSoft, borderBottom: `1px solid ${theme.border}` }}>
                    <h3 style={{ margin: 0, color: theme.text, fontSize: 18, fontWeight: 950 }}>
                      {activeUserModal === "contact" ? "Contact Us" : activeUserModal === "settings" ? "Settings" : activeUserModal === "login" ? "Login Info" : "Profile / Personal Info"}
                    </h3>
                  </div>
                  <div style={{ padding: 18, display: "grid", gap: 12 }}>
                    {(activeUserModal === "profile" || activeUserModal === "login") && [
                      ["User email", session?.email || "Not available"],
                      ["Role", session?.role || "Viewer"],
                      ["Last login", session?.lastLogin || session?.lastLoginAt || "Current session"],
                      ["Access type", isAdmin ? "Administrator" : "Viewer"],
                      ["Approved user status", APPROVED_ACCESS[String(session?.email ?? "").trim().toLowerCase()] ? "Approved" : "Not listed"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: "grid", gap: 4, borderBottom: `1px solid ${theme.border}`, paddingBottom: 10 }}>
                        <span style={{ color: theme.subtext, fontSize: 12, fontWeight: 850 }}>{label}</span>
                        <strong style={{ color: theme.text, overflowWrap: "anywhere" }}>{value}</strong>
                      </div>
                    ))}
                    {activeUserModal === "contact" && (
                      <>
                        <div style={{ color: theme.text, fontWeight: 950 }}>System owner / Admin contact</div>
                        <div style={{ color: theme.subtext }}>Ali Abdulamir</div>
                        <div style={{ color: theme.text, fontWeight: 950, marginTop: 8 }}>Support email</div>
                        <div style={{ color: theme.subtext }}>support@igccgroup.com</div>
                        <div style={{ marginTop: 10, color: theme.text, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, lineHeight: 1.5 }}>For access or dashboard support, please contact the system administrator.</div>
                      </>
                    )}
                    {activeUserModal === "settings" && (
                      <div style={{ color: theme.subtext, lineHeight: 1.5 }}>Settings are currently limited to dashboard preferences such as light and dark mode. Additional profile settings can be added when access management is expanded.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 16, padding: 16, color: theme.subtext, lineHeight: 1.45, background: themeMode === "light" ? "#ffffff" : theme.inputBg }}>
                Move the cursor over any account option to show its details here.
              </div>
            )}

            <div style={{ marginTop: "auto", borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
              <button type="button" onClick={onLogout} style={{ width: "100%", border: "none", borderRadius: 14, padding: "13px 15px", background: "rgba(220,38,38,0.10)", color: theme.danger, textAlign: "left", cursor: "pointer", fontWeight: 950 }}>Logout</button>
            </div>
          </aside>
        </div>
      )}

      {isLoading && (
        <div style={{ marginBottom: 12, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", boxShadow: theme.cardShadow, color: theme.subtext, fontSize: 13, fontWeight: 850 }}>
          Loading financial data in the background...
        </div>
      )}

      <div className="dashboard-header" style={{ position: "relative", zIndex: 30, marginBottom: 12, overflow: "visible", background: "linear-gradient(135deg, #041d36 0%, #062b4f 58%, #073861 100%)", border: "1px solid rgba(148, 163, 184, 0.24)", borderRadius: 14, padding: 0, boxShadow: "0 18px 42px rgba(15, 23, 42, 0.18)" }}>
        <div className="dashboard-header-main" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "22px 26px" }}>
          <div className="dashboard-brand" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, border: "1px solid rgba(255,255,255,0.16)", background: "#ffffff", display: "grid", placeItems: "center", flex: "0 0 auto", overflow: "hidden", boxShadow: "0 12px 26px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)" }}>
              <img src={getPublicAssetUrl("igcc-logo.svg")} alt="IGCC logo" style={{ width: 54, height: 54, objectFit: "contain" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#67e8f9", fontSize: 11, fontWeight: 950, letterSpacing: 0, textTransform: "uppercase" }}>IRAQ GATE CONTRACTING COMPANY</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 27, letterSpacing: 0, lineHeight: 1.02, fontWeight: 950, color: "#ffffff" }}>Financial Dashboard</h1>
              <p style={{ margin: "7px 0 0", color: "rgba(226,232,240,0.86)", fontSize: 13, maxWidth: 720 }}>Executive view of cost, AFP approval, profitability, and portfolio performance.</p>
            </div>
          </div>
          <div className="dashboard-user-actions" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", justifyContent: "flex-end", borderLeft: "1px solid rgba(255,255,255,0.16)", paddingLeft: 22 }}>
            <div style={{ color: "rgba(226,232,240,0.78)", fontSize: 12, fontWeight: 850, textAlign: "left", lineHeight: 1.42 }}>
              <div style={{ color: "rgba(226,232,240,0.78)", fontWeight: 800 }}>Welcome,</div>
              <div style={{ color: "#fff", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 950 }}>{portalUserName}</div>
              <div><span style={{ color: "#22d3ee", textTransform: "uppercase" }}>{session?.role ?? "Viewer"}</span> | Last updated: {lastUpdatedLabel}</div>
            </div>
            <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
              {activePage === "overview" && (
                <button
                  type="button"
                  onClick={handlePrintCeoPnLReport}
                  style={{ height: 36, border: "1px solid rgba(94,234,212,0.36)", borderRadius: 10, background: "rgba(20,184,166,0.18)", color: "#e6fffb", cursor: "pointer", padding: "0 13px", fontSize: 12, fontWeight: 950 }}
                >
                  Export CEO Report
                </button>
              )}
              {[
                ["settings", "⚙ Settings"],
                ["info", "ℹ Info"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveHeaderTool((current) => current === key ? "" : key)}
                  style={{ height: 36, border: "1px solid rgba(255,255,255,0.22)", borderRadius: 10, background: activeHeaderTool === key ? "rgba(37,99,235,0.42)" : "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", padding: "0 12px", fontSize: 12, fontWeight: 950 }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (isUserMenuOpen) setActiveUserModal("");
                  setIsUserMenuOpen((current) => !current);
                }}
                aria-label="Open user menu"
                style={{ width: 40, height: 36, cursor: "pointer", backgroundColor: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 10, fontWeight: 950, fontSize: 13, lineHeight: 1, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
              >
                CEO
              </button>
              {activeHeaderTool && (
                <div style={{ position: "absolute", right: 0, top: 44, zIndex: 60, width: 280, border: "1px solid rgba(148,163,184,0.30)", borderRadius: 14, padding: 14, background: "#ffffff", color: "#10233f", boxShadow: "0 24px 60px rgba(15,23,42,0.26)" }}>
                  {activeHeaderTool === "settings" ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <strong>Table Settings</strong>
                      <label style={{ display: "grid", gap: 6, color: "#64748b", fontSize: 11, fontWeight: 950 }}>View Type
                        <select value={ceoViewType} onChange={(event) => setCeoViewType(event.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontWeight: 850 }}>
                          <option value="ceo">CEO View</option>
                          <option value="project">Project Manager View</option>
                        </select>
                      </label>
                      <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>Columns: AFP, cost, margin, net profit, status, trend. Density: compact executive.</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 8, fontSize: 12, lineHeight: 1.45 }}>
                      <strong>Definitions</strong>
                      <span><b>AFP:</b> Submitted / Approved Financial Plan.</span>
                      <span><b>Margin:</b> (Approved AFP - Total Cost) / Approved AFP.</span>
                      <span><b>Total Cost:</b> Spent cost plus CN impact where applicable.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {activePage !== "home" && (
        <div className="portfolio-filter-strip" style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 26px 12px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current, portfolio: "", hub: "", costCenter: "" }))}
            style={{ color: filters.portfolio ? theme.text : "#fff", background: filters.portfolio ? theme.inputBg : theme.accentStrong, border: `1px solid ${filters.portfolio ? theme.border : theme.accentStrong}`, borderRadius: 6, padding: "7px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            All Portfolios
          </button>
          {HUB_SECTIONS.map((section) => {
            const isActive = filters.portfolio === section.label;
            return (
              <button
                key={section.label}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, portfolio: section.label, hub: "", costCenter: "" }))}
                style={{ color: isActive ? "#fff" : section.accent, background: isActive ? section.accent : section.soft, border: `1px solid ${section.accent}55`, borderRadius: 6, padding: "7px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
        )}
        {activePage !== "home" && (
        <div className="dashboard-filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", columnGap: 12, rowGap: 12, alignItems: "end", padding: "16px 26px 18px", borderTop: "1px solid rgba(255,255,255,0.12)", background: "rgba(2, 12, 27, 0.18)" }}>
          {[
            ["Hub", "HUB", filters.hub, (event) => setFilters((current) => ({ ...current, hub: event.target.value, costCenter: "" })), ["", ...filteredHubOptions], "All hubs"],
            ["Cost Center", "CC", filters.costCenter, handleFilterChange("costCenter"), ["", ...filteredCostCenterOptions], "All centers"],
          ].map(([label, icon, value, onChange, options, emptyLabel]) => (
            <label key={label} style={{ display: "block", color: theme.subtext, fontWeight: 900, fontSize: 10, textTransform: "uppercase" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ display: "inline-grid", placeItems: "center", minWidth: 22, height: 18, borderRadius: 5, background: theme.accentSoft, color: theme.accentStrong, fontSize: 9, fontWeight: 950 }}>{icon}</span>
                {label}
              </span>
              <select
                value={value}
                onChange={onChange}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 9px", marginTop: 5, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 12, fontWeight: 800 }}
              >
                {options.map((option) => (
                  <option key={option || emptyLabel} value={option}>{option || emptyLabel}</option>
                ))}
              </select>
            </label>
          ))}

          <div style={{ color: theme.subtext, fontWeight: 900, fontSize: 10, textTransform: "uppercase" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <span style={{ display: "inline-grid", placeItems: "center", minWidth: 22, height: 18, borderRadius: 5, background: theme.accentSoft, color: theme.accentStrong, fontSize: 9, fontWeight: 950 }}>TM</span>
              Time Mode
            </span>
            {renderPeriodToggleFor(periodView, handleTimeModeChange)}
          </div>

          <label style={{ display: "block", color: theme.subtext, fontWeight: 900, fontSize: 10, textTransform: "uppercase" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ display: "inline-grid", placeItems: "center", minWidth: 22, height: 18, borderRadius: 5, background: theme.accentSoft, color: theme.accentStrong, fontSize: 9, fontWeight: 950 }}>YR</span>
              Year
            </span>
            <select value={filters.year} onChange={handleYearFilterChange} style={{ width: "100%", boxSizing: "border-box", padding: "8px 9px", marginTop: 5, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 12, fontWeight: 800 }}>
              <option value="">All years</option>
              {yearsLoaded.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>

          {periodView === "monthly" && (
            <label style={{ display: "block", color: theme.subtext, fontWeight: 900, fontSize: 10, textTransform: "uppercase" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ display: "inline-grid", placeItems: "center", minWidth: 22, height: 18, borderRadius: 5, background: theme.accentSoft, color: theme.accentStrong, fontSize: 9, fontWeight: 950 }}>MO</span>
                Month
              </span>
              <select value={filters.month} onChange={handleFilterChange("month")} style={{ width: "100%", boxSizing: "border-box", padding: "8px 9px", marginTop: 5, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontSize: 12, fontWeight: 800 }}>
                <option value="">All months</option>
                {filteredMonthOptions.map((month) => (
                  <option key={month.label} value={month.label}>{month.label}</option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              setFilters({ portfolio: "", hub: "", costCenter: "", month: "", year: "" });
              setPeriodView("monthly");
            }}
            style={{ padding: "9px 11px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: "pointer", fontWeight: 900, fontSize: 12 }}
          >
            Clear
          </button>
        </div>
        )}
      </div>

      <div className="dashboard-nav-shell" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", margin: "-12px 0 24px", flexWrap: "wrap", background: "linear-gradient(135deg, #06213d, #082d50)", border: "1px solid rgba(148, 163, 184, 0.22)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "14px 26px", boxShadow: "0 14px 34px rgba(15,23,42,0.14)" }}>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((current) => !current)}
        >
          <span aria-hidden="true">☰</span>
          Menu
        </button>
        <div className={`dashboard-nav-list ${isMobileNavOpen ? "is-open" : ""}`} style={{ display: "inline-flex", gap: 10, padding: 0, borderRadius: 12, flexWrap: "wrap" }}>
          {visibleNavItems.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setActivePage(value);
                setIsMobileNavOpen(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                border: activePage === value ? "1px solid rgba(96,165,250,0.55)" : "1px solid transparent",
                borderRadius: 10,
                padding: "12px 16px",
                cursor: "pointer",
                fontWeight: 950,
                background: activePage === value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "transparent",
                color: "#fff",
                boxShadow: activePage === value ? "0 10px 22px rgba(37,99,235,0.28)" : "none",
              }}
            >
              <span style={{ display: "inline-grid", placeItems: "center", minWidth: 26, height: 24, borderRadius: 7, background: activePage === value ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)", color: "#dbeafe", fontSize: 10, fontWeight: 950 }}>{navIcons[value] ?? ""}</span>
              {label}
            </button>
          ))}
        </div>
        {!VIEW_ONLY_MODE && (
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ padding: 10, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.panelBg, color: theme.text }} />
        )}
        {!VIEW_ONLY_MODE && filename && <span style={{ color: theme.subtext, minWidth: 200, textAlign: "center", display: "inline-block" }}>{filename}</span>}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            padding: "12px 20px",
            cursor: "pointer",
            backgroundColor: "rgba(255,255,255,0.06)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            fontWeight: 900,
          }}
        >
          {themeMode === "light" ? "Dark Mode" : "Light Mode"}
        </button>
        {!VIEW_ONLY_MODE && (
          <button
            type="button"
            onClick={exportCSV}
            disabled={!sortedData.length}
            style={{
              padding: "10px 20px",
              cursor: sortedData.length ? "pointer" : "not-allowed",
              backgroundColor: sortedData.length ? theme.accent : "#718096",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              boxShadow: sortedData.length ? "0 10px 20px rgba(31,53,85,0.12)" : "none",
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: theme.danger, marginBottom: 16, textAlign: "center" }}>
          {error}
        </div>
      )}

      {unknownCostCenters.length > 0 && (
        <div style={{ color: theme.danger, marginBottom: 16, textAlign: "center" }}>
          Unknown cost centers found: {unknownCostCenters.join(", ")}
        </div>
      )}

      {activePage === "home" && (
        <div style={{ display: "grid", gap: 22 }}>
          <section style={{ position: "relative", overflow: "hidden", minHeight: 220, border: "1px solid rgba(14,165,233,0.22)", borderRadius: 16, padding: "44px 48px", color: "#fff", background: "radial-gradient(circle at 88% 52%, rgba(45,212,191,0.38), transparent 20%), radial-gradient(circle at 74% 18%, rgba(59,130,246,0.28), transparent 20%), linear-gradient(135deg, #082d74 0%, #073b69 48%, #0fafa7 100%)", boxShadow: "0 22px 50px rgba(15,23,42,0.18)" }}>
            <div style={{ position: "absolute", inset: "auto -8% -44% 0", height: 190, background: "radial-gradient(ellipse at center, rgba(125,211,252,0.20), transparent 68%)", opacity: 0.9 }} />
            <svg viewBox="0 0 430 210" aria-hidden="true" style={{ position: "absolute", right: 42, top: 22, width: "min(39%, 430px)", height: "auto", opacity: 0.74 }}>
              <defs>
                <linearGradient id="heroCardGradient" x1="0" x2="1">
                  <stop offset="0" stopColor="#60a5fa" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#5eead4" stopOpacity="0.75" />
                </linearGradient>
              </defs>
              <path d="M41 155 C88 117, 103 130, 139 86 S207 93, 241 52 S304 42, 369 26" fill="none" stroke="#a7f3d0" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
              {[41, 139, 241, 369].map((cx, index) => (
                <circle key={cx} cx={cx} cy={[155, 86, 52, 26][index]} r="9" fill="#cffafe" opacity="0.85" />
              ))}
              <g transform="translate(162 48) rotate(14)">
                <rect width="205" height="126" rx="18" fill="url(#heroCardGradient)" stroke="#bfdbfe" strokeOpacity="0.55" />
                <circle cx="60" cy="58" r="31" fill="none" stroke="#dbeafe" strokeWidth="16" opacity="0.85" />
                <path d="M60 27 A31 31 0 0 1 91 58" fill="none" stroke="#14b8a6" strokeWidth="16" />
                {[55, 83, 111, 139].map((x, index) => (
                  <rect key={x} x={x + 58} y={82 - index * 13} width="17" height={37 + index * 13} rx="4" fill="#dbeafe" opacity="0.8" />
                ))}
              </g>
            </svg>
            <div style={{ position: "relative", zIndex: 1, maxWidth: 710 }}>
              <div style={{ color: "#cffafe", fontSize: 13, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.2 }}>IGCC Financial Portal</div>
              <h2 style={{ margin: "24px 0 0", color: "#fff", fontSize: 39, lineHeight: 1.08, letterSpacing: 0, fontWeight: 950 }}>Welcome back, {portalUserName}</h2>
              <p style={{ margin: "20px 0 0", color: "rgba(255,255,255,0.88)", fontSize: 17, lineHeight: 1.75, maxWidth: 720 }}>A focused entry point for executive financial review, commercial approval visibility, profitability analysis, and spend reporting.</p>
            </div>
          </section>

          {renderExecutiveInsights("Management Snapshot", portalInsights)}

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 245px), 1fr))", gap: 16 }}>
            {portalCards.map(([label, value, detail, color, icon]) => (
              <div key={label} className="executive-hover-card" style={{ position: "relative", overflow: "hidden", minHeight: 166, border: "1px solid rgba(148,163,184,0.28)", borderRadius: 14, padding: 24, background: "#fff", boxShadow: "0 14px 34px rgba(15,23,42,0.10)", transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease" }}>
                <div style={{ position: "absolute", right: 12, bottom: 10, width: 150, height: 64, opacity: 0.25 }}>
                  <svg viewBox="0 0 150 64" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
                    <path d="M4 51 C26 48, 31 34, 53 38 S85 53, 99 28 S126 25, 146 11" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
                    <circle cx="146" cy="11" r="5" fill={color} />
                  </svg>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <span style={{ display: "inline-grid", placeItems: "center", minWidth: 58, height: 58, borderRadius: 14, background: `${color}14`, color, fontSize: 14, fontWeight: 950 }}>{icon}</span>
                  <div>
                    <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 9, color, fontSize: label === "Last Updated" ? 23 : 31, lineHeight: 1.07, fontWeight: 950, letterSpacing: 0 }}>{value}</div>
                  </div>
                </div>
                <div style={{ position: "relative", zIndex: 1, marginTop: 15, color: "#475569", fontSize: 14, lineHeight: 1.45 }}>{detail}</div>
              </div>
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 18 }}>
            {portalNavigationCards.map(([page, title, description, icon, color, visual], index) => (
              <button
                key={page}
                type="button"
                className="executive-hover-button"
                onClick={() => setActivePage(page)}
                style={{ position: "relative", overflow: "hidden", minHeight: 260, textAlign: "left", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 14, padding: 28, background: index === 3 ? "linear-gradient(135deg, #fff 0%, #fff7f7 100%)" : "linear-gradient(135deg, #fff 0%, #f8fbff 100%)", color: "#0f172a", cursor: "pointer", boxShadow: "0 16px 38px rgba(15,23,42,0.10)", transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease" }}
              >
                <span style={{ display: "inline-grid", placeItems: "center", minWidth: 58, height: 48, borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: "#fff", fontSize: 16, fontWeight: 950, marginBottom: 24, boxShadow: `0 12px 24px ${color}33` }}>{icon}</span>
                <div style={{ maxWidth: 245, fontSize: 24, lineHeight: 1.1, fontWeight: 950, letterSpacing: 0 }}>{title}</div>
                <div style={{ marginTop: 15, maxWidth: 285, color: "#334155", fontSize: 15, lineHeight: 1.62 }}>{description}</div>
                <svg viewBox="0 0 180 150" aria-hidden="true" style={{ position: "absolute", right: 18, bottom: 22, width: 132, height: 110, opacity: 0.16 }}>
                  {visual === "bars" && [105, 78, 50, 24].map((height, barIndex) => <rect key={height} x={24 + barIndex * 36} y={132 - height} width="19" height={height} rx="4" fill={color} />)}
                  {visual === "pie" && <><circle cx="96" cy="76" r="52" fill={color} /><path d="M96 24 L96 76 L148 76 A52 52 0 0 0 96 24" fill="#fff" /></>}
                  {visual === "doc" && <><path d="M54 20 H120 L150 50 V130 H54 Z" fill={color} /><path d="M120 20 V52 H150" fill="#fff" /><path d="M76 68 H128 M76 88 H128 M76 108 H118" stroke="#fff" strokeWidth="8" strokeLinecap="round" /></>}
                  {visual === "line" && <path d="M18 118 C46 80, 60 120, 84 72 S120 90, 138 35 S156 50, 169 20" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />}
                </svg>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 210, justifyContent: "space-between", marginTop: 24, padding: "13px 16px", borderRadius: 10, background: `${color}12`, border: `1px solid ${color}24`, color, fontSize: 15, fontWeight: 950 }}>View Dashboard <span>&rarr;</span></div>
              </button>
            ))}
          </section>

        </div>
      )}

      {activePage === "spent" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Spent Report</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Monthly spend entries by portfolio, hub, cost center, and GL name.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {renderCostViewToggle()}
              {isLoadingFullSpentDetails && (
                <span style={{ color: theme.text, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Loading Details</span>
              )}
              <span style={{ color: theme.subtext, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Excel Source</span>
            </div>
          </div>

          {spentImportSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 14, background: theme.inputBg }}>
              {[
                ["Files Processed", spentImportSummary.filesProcessed?.length ?? 0],
                ["Rows Processed", spentImportSummary.totalRows ?? 0],
                ["Valid Rows", spentImportSummary.validRows ?? 0],
                ["Invalid Rows", spentImportSummary.invalidRows ?? 0],
                ["File Errors", spentImportSummary.fileErrors?.length ?? 0],
                ["Months Detected", spentImportSummary.monthsDetected?.length ?? 0],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                  <strong style={{ color: theme.text, fontSize: 18 }}>{Number(value).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          )}
          {spentImportSummary?.fileErrors?.length > 0 && (
            <div style={{ marginTop: 12, color: theme.danger, background: "rgba(176,0,32,0.08)", border: "1px solid rgba(176,0,32,0.18)", borderRadius: 8, padding: 11, fontSize: 13 }}>
              {spentImportSummary.fileErrors.map((item) => `${item.fileName}: ${item.error}`).join(" | ")}
            </div>
          )}
          {spentImportSummary?.invalidRows > 0 && (
            <div style={{ marginTop: 12, color: theme.subtext, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 11, fontSize: 13 }}>
              {spentImportSummary.invalidRows.toLocaleString()} rows were marked invalid because month/year could not be detected.
            </div>
          )}

          {spentEntryMessage && <div style={{ marginTop: 12, color: theme.accentStrong, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 11, fontSize: 13 }}>{spentEntryMessage}</div>}
          {spentEntryError && <div style={{ marginTop: 12, color: theme.danger, background: "rgba(176,0,32,0.08)", border: "1px solid rgba(176,0,32,0.18)", borderRadius: 8, padding: 11, fontSize: 13 }}>{spentEntryError}</div>}

          {renderExecutiveInsights("Spend Narrative", spentInsights)}
          {renderCostSourceBreakdown()}

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {[
              [costViewLabel, formatCompactCurrency(spentTotalAmount), isAdjustedCostActive ? `Gross ${formatCompactCurrency(officialVisibleTotal)} | CN ${formatCompactCurrency(cnNetImpact)}` : "Filtered spend value", "TS", "#0f766e"],
              ["Top GL Name", topSpentGl?.[0] || "No data", topSpentGl ? formatCompactCurrency(topSpentGl[1]) : "-", "GL", "#2563eb"],
              ["Top Cost Center", topSpentCostCenter?.[0] || "No data", topSpentCostCenter ? formatCompactCurrency(topSpentCostCenter[1]) : "-", "CC", "#16a34a"],
              ["Months Included", spentMonthCount.toLocaleString(), "Periods in current view", "MO", "#7c3aed"],
            ].map(([label, value, detail, icon, color]) => (
              <div key={label} className="executive-hover-card" style={{ position: "relative", overflow: "hidden", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.08)", transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: `${color}14`, color, fontSize: 13, fontWeight: 950 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 6, color, fontSize: label === "Top GL Name" ? 18 : 24, lineHeight: 1.1, fontWeight: 950, overflowWrap: "anywhere" }}>{value}</div>
                    <div style={{ marginTop: 8, color: theme.subtext, fontSize: 12 }}>{detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {renderWorkshopCreditImpact()}

          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Spend Explorer</h3>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Compare GL cost distribution across cost centers.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 12, background: theme.accentSoft, border: `1px solid ${theme.border}`, flexWrap: "wrap" }}>
                {spentGroupOptions.map(([value, label]) => (
                  value === "gl" ? (
                    <details key={value} style={{ position: "relative" }}>
                      <summary
                        onClick={() => handleSpentGroupChange(value)}
                        style={{ listStyle: "none", border: "none", borderRadius: 9, padding: "9px 12px", cursor: "pointer", background: spentGroupBy === value ? theme.panelBg : "transparent", color: spentGroupBy === value ? theme.accentStrong : theme.text, boxShadow: spentGroupBy === value ? "0 4px 14px rgba(15,23,42,0.10)" : "none", fontSize: 12, fontWeight: 950 }}
                      >
                        {label}{selectedSpentGlNames.length ? ` (${selectedSpentGlNames.length})` : ""}
                      </summary>
                      <div style={{ position: "absolute", right: 0, zIndex: 5, marginTop: 8, width: 310, maxHeight: 340, overflowY: "auto", border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.panelBg, boxShadow: "0 18px 38px rgba(15,23,42,0.18)" }}>
                        <button type="button" onClick={clearSpentGlSelection} style={{ width: "100%", border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.inputBg, color: theme.text, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 950, marginBottom: 8 }}>Clear GL choices</button>
                        <div style={{ display: "grid", gap: 4 }}>
                          {spentGlOptions.map((glName) => (
                            <label key={glName} style={{ display: "flex", gap: 9, alignItems: "center", padding: "8px 7px", borderRadius: 8, cursor: "pointer", color: theme.text, fontSize: 12, fontWeight: 800 }}>
                              <input type="checkbox" checked={selectedSpentGlSet.has(glName)} onChange={() => toggleSpentGlSelection(glName)} />
                              <span style={{ overflowWrap: "anywhere" }}>{glName}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </details>
                  ) : (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleSpentGroupChange(value)}
                      style={{ border: "none", borderRadius: 9, padding: "9px 12px", cursor: "pointer", background: spentGroupBy === value ? theme.panelBg : "transparent", color: spentGroupBy === value ? theme.accentStrong : theme.text, boxShadow: spentGroupBy === value ? "0 4px 14px rgba(15,23,42,0.10)" : "none", fontSize: 12, fontWeight: 950 }}
                    >
                      {label}
                    </button>
                  )
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
            {!isSpentGlComparisonActive && (
              <>
                {spentGroupedRows.slice(0, 18).map((row, index) => {
                  const width = maxSpentGroupAmount ? Math.max(4, Math.round((Math.abs(row.amount) / maxSpentGroupAmount) * 100)) : 0;
                  const costShare = spentTotalAmount ? row.amount / spentTotalAmount : 0;
                  const revenueShare = approvedRevenue ? row.amount / approvedRevenue : null;
                  return (
                    <div
                      key={row.key || row.label}
                      style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(230px, 0.72fr) minmax(180px, 1fr) 190px", gap: 14, alignItems: "center", textAlign: "left", border: `1px solid ${theme.border}`, borderRadius: 12, padding: "13px 14px", background: theme.panelBg, color: theme.text, cursor: "default", boxShadow: "0 7px 18px rgba(15,23,42,0.05)" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                          <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, background: theme.accentSoft, color: theme.accentStrong, fontSize: 12, fontWeight: 950 }}>{index + 1}</span>
                          <strong style={{ overflowWrap: "anywhere" }}>{row.label}</strong>
                        </div>
                        <div style={{ marginTop: 6, color: theme.subtext, fontSize: 12 }}>{row.sublabel} | {row.costCenterCount} centers | {row.monthCount} months</div>
                      </div>
                      <div>
                        <div style={{ height: 13, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                          <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0f766e, #2563eb)" }} />
                        </div>
                        <div style={{ marginTop: 7, display: "flex", gap: 8, flexWrap: "wrap", color: theme.subtext, fontSize: 11, fontWeight: 850 }}>
                          <span>Cost share <strong style={{ color: theme.accentStrong }}>{formatPercent(costShare)}</strong></span>
                          <span style={{ color: theme.border }}>|</span>
                          <span>Revenue share <strong style={{ color: revenueShare === null ? theme.subtext : theme.accentWarm }}>{revenueShare === null ? "-" : formatPercent(revenueShare)}</strong></span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: theme.text, fontWeight: 950 }}>{formatCurrency(row.amount)}</div>
                        <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{row.rows.toLocaleString()} rows</div>
                      </div>
                    </div>
                  );
                })}
                {!spentGroupedRows.length && (
                  <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: 18, color: theme.subtext, background: theme.inputBg }}>No spend groups match the current filters.</div>
                )}
              </>
            )}

            {isSpentGlComparisonActive && selectedSpentGlNames.length === 1 && (
              <>
                {spentGlComparisonRows.slice(0, 24).map((row, index) => {
                  const width = maxSpentGlComparisonAmount ? Math.max(4, Math.round((Math.abs(row.amount) / maxSpentGlComparisonAmount) * 100)) : 0;
                  return (
                    <div key={`${row.costCenter}-${row.glName}`} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 0.55fr) minmax(200px, 1fr) 220px", gap: 14, alignItems: "center", border: `1px solid ${theme.border}`, borderRadius: 12, padding: "13px 14px", background: theme.panelBg, boxShadow: "0 7px 18px rgba(15,23,42,0.05)" }}>
                      <div>
                        <strong style={{ color: theme.text }}>{index + 1}. {row.costCenter}</strong>
                        <div style={{ marginTop: 5, color: theme.subtext, fontSize: 12 }}>{row.rows.toLocaleString()} rows</div>
                      </div>
                      <div>
                        <div style={{ height: 14, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                          <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0f766e, #2563eb)" }} />
                        </div>
                        <div style={{ marginTop: 7, display: "flex", gap: 8, flexWrap: "wrap", color: theme.subtext, fontSize: 11, fontWeight: 850 }}>
                          <span>Cost share <strong style={{ color: theme.accentStrong }}>{formatPercent(row.costShare)}</strong></span>
                          <span style={{ color: theme.border }}>|</span>
                          <span>Revenue share <strong style={{ color: row.revenueShare === null ? theme.subtext : theme.accentWarm }}>{row.revenueShare === null ? "-" : formatPercent(row.revenueShare)}</strong></span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: theme.text, fontWeight: 950 }}>{formatCurrency(row.amount)}</div>
                        <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{row.glName}</div>
                      </div>
                    </div>
                  );
                })}
                {!spentGlComparisonRows.length && <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: 18, color: theme.subtext, background: theme.inputBg }}>No cost centers match the selected GL.</div>}
              </>
            )}

            {isSpentGlComparisonActive && selectedSpentGlNames.length > 1 && (
              <>
                {spentGlComparisonByCenter.slice(0, 18).map((centerRow, index) => {
                  const totalWidth = maxSpentGlCenterTotal ? Math.max(4, Math.round((Math.abs(centerRow.total) / maxSpentGlCenterTotal) * 100)) : 0;
                  return (
                    <div key={centerRow.costCenter} style={{ border: `1px solid ${theme.border}`, borderRadius: 13, padding: 15, background: theme.panelBg, boxShadow: "0 7px 18px rgba(15,23,42,0.05)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 0.45fr) minmax(220px, 1fr) 150px", gap: 14, alignItems: "center" }}>
                        <div>
                          <strong style={{ color: theme.text }}>{index + 1}. {centerRow.costCenter}</strong>
                          <div style={{ marginTop: 5, color: theme.subtext, fontSize: 12 }}>{centerRow.glRows.length} selected GLs</div>
                        </div>
                        <div>
                          <div style={{ width: `${totalWidth}%`, minWidth: 38, height: 16, borderRadius: 999, background: theme.accentSoft, overflow: "hidden", display: "flex" }}>
                            {centerRow.glRows.map((glRow) => {
                              const segmentWidth = Math.max(5, Math.abs(glRow.amount) / (Math.abs(centerRow.total) || 1) * 100);
                              return <div key={glRow.glName} title={`${glRow.glName}: ${formatCurrency(glRow.amount)}`} style={{ width: `${segmentWidth}%`, height: "100%", background: getSpentGlColor(glRow.glName) }} />;
                            })}
                          </div>
                          <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                            {centerRow.glRows.map((glRow) => (
                              <div key={glRow.glName} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.7fr) minmax(80px, 1fr) 110px", gap: 9, alignItems: "center", color: theme.subtext, fontSize: 11, fontWeight: 850 }}>
                                <span style={{ color: getSpentGlColor(glRow.glName), overflowWrap: "anywhere" }}>{glRow.glName}</span>
                                <span>Cost {formatPercent(glRow.costShare)} | Revenue {glRow.revenueShare === null ? "-" : formatPercent(glRow.revenueShare)}</span>
                                <strong style={{ textAlign: "right", color: theme.text }}>{formatCompactCurrency(glRow.amount)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: theme.text, fontWeight: 950 }}>{formatCurrency(centerRow.total)}</div>
                          <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>selected GL total</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!spentGlComparisonByCenter.length && <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: 18, color: theme.subtext, background: theme.inputBg }}>No cost centers match the selected GLs.</div>}
              </>
            )}
          </div>

          {false ? (
            <>
              <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong style={{ color: theme.text }}>Drill-down: {selectedSpentGroup.label}</strong>
                  <div style={{ color: theme.subtext, fontSize: 12, marginTop: 3 }}>
                    Showing {spentDetailRows.length ? (safeSpentDetailPage - 1) * spentDetailPageSize + 1 : 0}-{Math.min(safeSpentDetailPage * spentDetailPageSize, spentDetailRows.length).toLocaleString()} of {spentDetailRows.length.toLocaleString()} detailed rows
                  </div>
                </div>
                <button type="button" onClick={() => setSpentSelectedGroupKey("")} style={{ border: `1px solid ${theme.border}`, borderRadius: 9, background: theme.inputBg, color: theme.text, padding: "8px 12px", fontWeight: 900, cursor: "pointer" }}>Close Detail</button>
              </div>

              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        ["portfolio", "Portfolio", leftHeaderStyle],
                        ["hub", "Hub", leftHeaderStyle],
                        ["costCenter", "Cost Center", leftHeaderStyle],
                        ["month", "Month", leftHeaderStyle],
                        ["category", "GL Name", leftHeaderStyle],
                        ["vendor", "Vendor", leftHeaderStyle],
                        ["amount", "Amount", tableHeaderStyle],
                      ].map(([field, label, style]) => (
                        <th key={field} style={style}>
                          <button type="button" onClick={() => handleSpentDetailSort(field)} style={{ border: "none", background: "transparent", color: "inherit", font: "inherit", fontWeight: 950, cursor: "pointer", padding: 0 }}>
                            {label}{spentDetailSort.field === field ? (spentDetailSort.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSpentDetailRows.map((row, index) => {
                      const hub = resolveHub(row);
                      const portfolio = resolvePortfolio(row);
                      return (
                        <tr key={`${row.id || row.costCenter}-${row.month}-${row.category}-${row.vendor}-${index}`} style={{ background: index % 2 === 0 ? theme.panelBg : theme.rowAlt }}>
                          <td style={leftCellStyle}>{portfolio}</td>
                          <td style={leftCellStyle}>{hub}</td>
                          <td style={leftCellStyle}>{row.costCenter}</td>
                          <td style={leftCellStyle}>{row.month}</td>
                          <td style={leftCellStyle}>{row.category || "Uncategorized"}</td>
                          <td style={leftCellStyle}>{row.vendor || "Unspecified Vendor"}</td>
                          <td style={tableCellStyle}>{formatCurrency(row.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {spentDetailRows.length > spentDetailPageSize && (
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setTransactionPage((current) => Math.max(1, current - 1))}
                    disabled={safeSpentDetailPage === 1}
                    style={{ padding: "7px 11px", borderRadius: 7, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: safeSpentDetailPage === 1 ? "not-allowed" : "pointer", opacity: safeSpentDetailPage === 1 ? 0.55 : 1, fontWeight: 850 }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionPage((current) => Math.min(spentDetailPageCount, current + 1))}
                    disabled={safeSpentDetailPage === spentDetailPageCount}
                    style={{ padding: "7px 11px", borderRadius: 7, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: safeSpentDetailPage === spentDetailPageCount ? "not-allowed" : "pointer", opacity: safeSpentDetailPage === spentDetailPageCount ? 0.55 : 1, fontWeight: 850 }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {activePage === "overview" && (
        <div style={{ position: "relative", overflow: "hidden", marginBottom: 14, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 34%, #f4f9ff 100%)", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 18, padding: 18, boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}>
          <div style={{ position: "absolute", inset: "0 0 auto auto", width: 520, height: 360, background: "radial-gradient(circle at 70% 20%, rgba(20,184,166,0.16), transparent 34%), radial-gradient(circle at 22% 62%, rgba(37,99,235,0.12), transparent 36%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.9fr)", gap: 20, alignItems: "stretch", marginBottom: 18 }}>
            <div style={{ padding: "20px 12px 18px 12px" }}>
              <h1 style={{ margin: 0, color: "#071a3a", fontSize: 30, fontWeight: 950, letterSpacing: 0 }}>Executive Cockpit</h1>
              <p style={{ margin: "10px 0 0", color: "#335174", fontSize: 15, lineHeight: 1.65, maxWidth: 560 }}>Executive overview of financial performance, approval status, portfolio exposure, and key risks.</p>
              <div style={{ marginTop: 14 }}>{renderCostViewToggle()}</div>
            </div>
            <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 18, border: "1px solid rgba(20,184,166,0.28)", borderRadius: 14, padding: "22px 24px", background: "radial-gradient(circle at 80% 50%, rgba(20,184,166,0.35), transparent 22%), linear-gradient(135deg, #041d36 0%, #062b4f 58%, #064e5f 100%)", boxShadow: "0 18px 42px rgba(7,26,58,0.24), inset 0 1px 0 rgba(255,255,255,0.10)" }}>
              <div style={{ position: "absolute", inset: "auto -30px -24px 110px", height: 82, opacity: 0.42, background: "repeating-radial-gradient(ellipse at center, transparent 0 18px, rgba(94,234,212,0.18) 19px 20px)" }} />
              <span style={{ display: "grid", placeItems: "center", width: 58, height: 58, borderRadius: 16, color: "#a7f3d0", background: "rgba(20,184,166,0.18)", border: "1px solid rgba(94,234,212,0.28)", fontSize: 27, lineHeight: 1, boxShadow: "0 0 32px rgba(20,184,166,0.20)" }}>{overallStatus.icon}</span>
              <div style={{ position: "relative" }}>
                <div style={{ color: "#bfdbfe", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.2 }}>Overall Status</div>
                <div style={{ color: "#5eead4", fontSize: 25, lineHeight: 1.05, fontWeight: 950, textTransform: "uppercase", marginTop: 5 }}>{overallStatus.label}</div>
                <div style={{ color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 1.5, marginTop: 9 }}>{overallStatus.message}</div>
              </div>
            </div>
          </div>

          <section style={{ position: "relative", marginBottom: 22, border: "1px solid rgba(148,163,184,0.24)", borderRadius: 16, padding: 20, background: "#fff", boxShadow: "0 16px 38px rgba(15,23,42,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, color: "#071a3a", fontSize: 22, fontWeight: 950 }}>Executive Summary</h2>
                <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Filter-aware decision signals for {executiveScopeLabel}.</p>
              </div>
              <span style={{ color: "#0f766e", background: "#ecfdf5", border: "1px solid rgba(15,118,110,0.16)", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{costViewLabel}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {executiveSummaryItems.map((item) => (
                <div key={item.label} className="executive-hover-card" style={{ border: `1px solid ${item.color}22`, borderRadius: 14, padding: 16, background: `${item.color}0b`, transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                  <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{item.label}</div>
                  <div style={{ marginTop: 8, color: item.color, fontSize: 20, fontWeight: 950, lineHeight: 1.1, overflowWrap: "anywhere" }}>{item.value}</div>
                  <div style={{ marginTop: 7, color: "#475569", fontSize: 12, lineHeight: 1.45 }}>{item.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ position: "relative", marginBottom: 22, border: "1px solid rgba(124,58,237,0.30)", borderRadius: 16, padding: 20, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)", boxShadow: "0 18px 42px rgba(15,23,42,0.10)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>CEO View</div>
                <h2 style={{ margin: "4px 0 0", color: "#071a3a", fontSize: 25, fontWeight: 950 }}>CEO Profit &amp; Loss Summary</h2>
                <p style={{ margin: "6px 0 0", color: "#335174", fontSize: 13 }}>Performance overview across all cost centers with AFP, cost, margin, and risk signals.</p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ display: "grid", gap: 5, color: "#10233f", fontSize: 12, fontWeight: 850 }}>
                  <span>Period: <strong>{ceoReportPeriodLabel}</strong></span>
                  <span>Currency: <strong>USD</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handlePrintCeoPnLReport}
                  style={{ border: "1px solid rgba(37,99,235,0.24)", borderRadius: 10, padding: "10px 14px", background: "#eff6ff", color: "#0b4db3", cursor: "pointer", fontSize: 12, fontWeight: 950, boxShadow: "0 8px 20px rgba(37,99,235,0.10)" }}
                >
                  Export CEO Report
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
              {[
                ["Total Approved AFP", ceoReportTotals.approved, "#059669", "Approved commercial value"],
                ["Total Submitted AFP", ceoReportTotals.submitted, "#2563eb", "Submitted AFP pipeline"],
                ["Total Cost", ceoReportTotals.totalCost, "#f97316", "Cost after CN impact"],
                ["Total Net Profit", ceoReportTotals.netProfit, profitColor(ceoReportTotals.netProfit), "Approved AFP - total cost"],
                ["Overall Profit Margin", ceoReportMargin, profitColor(ceoReportTotals.netProfit), "Net profit / approved AFP", "percent"],
              ].map(([label, value, color, detail, type]) => (
                <div key={label} className="executive-hover-card" style={{ position: "relative", overflow: "hidden", border: `1px solid ${color}24`, borderRadius: 12, padding: 15, background: `${color}08`, minHeight: 104, boxShadow: "0 10px 24px rgba(15,23,42,0.06)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                  <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                  <strong style={{ display: "block", marginTop: 8, color: "#071a3a", fontSize: 22, lineHeight: 1.05, fontWeight: 950 }}>{type === "percent" ? formatPercent(value) : formatCompactCurrency(value)}</strong>
                  <div style={{ marginTop: 7, color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>{detail}</div>
                  <svg viewBox="0 0 110 28" aria-hidden="true" style={{ position: "absolute", right: 12, bottom: 10, width: 92, height: 24, opacity: 0.34 }}>
                    {getMiniTrend(type === "percent" ? "margin" : label.includes("Cost") ? "cost" : label.includes("Submitted") ? "submitted" : label.includes("Approved") ? "approved" : "net", 110, 28, 3).points && (
                      <polyline points={getMiniTrend(type === "percent" ? "margin" : label.includes("Cost") ? "cost" : label.includes("Submitted") ? "submitted" : label.includes("Approved") ? "approved" : "net", 110, 28, 3).points} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </div>
              ))}
            </div>

            {shouldShowCeoCnCards && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {[
                ["Total Received CN", cnReceivedTotal, "#059669", "RCN", "Credit notes received"],
                ["Total Issued CN", cnIssuedTotal, "#dc2626", "ICN", "Credit notes issued"],
                ["Net CN Impact", cnNetImpact, cnNetImpact >= 0 ? "#2563eb" : "#059669", "NET", "Received minus issued"],
              ].map(([label, value, color, icon, detail]) => (
                <div key={label} className="executive-hover-card" style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, border: `1px solid ${color}24`, borderRadius: 12, padding: "13px 14px", background: `${color}0b`, boxShadow: "0 10px 24px rgba(15,23,42,0.06)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, flex: "0 0 auto", borderRadius: 10, color, background: `${color}14`, border: `1px solid ${color}24`, fontSize: 11, fontWeight: 950 }}>{icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                    <strong style={{ display: "block", marginTop: 5, color: "#071a3a", fontSize: 19, lineHeight: 1.05, fontWeight: 950 }}>{formatCompactCurrency(value)}</strong>
                    <span style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 11 }}>{detail}</span>
                  </span>
                </div>
              ))}
            </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, 0.75fr)", gap: 16, alignItems: "start" }}>
              <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <input
                ref={ceoPnLSearchRef}
                value={ceoPnLColumnFilters.costCenter}
                onChange={(event) => updateCeoPnLFilter("costCenter", event.target.value)}
                placeholder="Search table..."
                style={{ width: 180, border: "1px solid rgba(148,163,184,0.38)", borderRadius: 10, padding: "9px 12px", background: "#fff", color: "#10233f", fontSize: 12, fontWeight: 850, outline: "none" }}
              />
              <span style={{ color: "#10233f", fontSize: 12, fontWeight: 950 }}>Quick Filters</span>
              {[
                ["Show Loss Making Only", "loss", "#dc2626"],
                ["High Margin (>20%)", "highMargin", "#059669"],
                ["High Cost Centers", "highCost", "#b45309"],
              ].map(([label, mode, color]) => (
                <button key={mode} type="button" onClick={() => applyCeoPnLQuickFilter(mode)} style={{ border: `1px solid ${color}24`, borderRadius: 10, padding: "9px 12px", background: `${color}0d`, color, cursor: "pointer", fontSize: 12, fontWeight: 950 }}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={clearCeoPnLFilters} disabled={!hasCeoPnLFilters} style={{ marginLeft: "auto", border: "1px solid rgba(37,99,235,0.24)", borderRadius: 10, padding: "9px 12px", background: hasCeoPnLFilters ? "#eff6ff" : "#f8fafc", color: hasCeoPnLFilters ? "#0b4db3" : "#94a3b8", cursor: hasCeoPnLFilters ? "pointer" : "default", fontSize: 12, fontWeight: 950 }}>
                Clear Filters
              </button>
              <button type="button" onClick={expandAllCeoPnL} style={{ border: "1px solid rgba(37,99,235,0.20)", borderRadius: 10, padding: "9px 12px", background: "#fff", color: "#0b4db3", cursor: "pointer", fontSize: 12, fontWeight: 950 }}>Expand All</button>
              <button type="button" onClick={collapseAllCeoPnL} style={{ border: "1px solid rgba(37,99,235,0.20)", borderRadius: 10, padding: "9px 12px", background: "#fff", color: "#0b4db3", cursor: "pointer", fontSize: 12, fontWeight: 950 }}>Collapse All</button>
              <button type="button" onClick={() => setCeoViewType((current) => current === "ceo" ? "project" : "ceo")} style={{ border: "1px solid rgba(15,118,110,0.22)", borderRadius: 10, padding: "9px 12px", background: ceoViewType === "ceo" ? "#ecfdf5" : "#eff6ff", color: ceoViewType === "ceo" ? "#0f766e" : "#0b4db3", cursor: "pointer", fontSize: 12, fontWeight: 950 }}>{ceoViewType === "ceo" ? "CEO View" : "Project Manager View"}</button>
            </div>

            {ceoPnLActiveFilterTags.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, background: "#f8fafc" }}>
                <span style={{ color: "#64748b", fontSize: 11, fontWeight: 950 }}>Active filters:</span>
                {ceoPnLActiveFilterTags.map(([label, value, group]) => (
                  <button key={`${label}-${value}`} type="button" onClick={() => clearCeoPnLFilterGroup(group)} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(37,99,235,0.18)", borderRadius: 999, padding: "7px 10px", background: "#ffffff", color: "#10233f", cursor: "pointer", fontSize: 11, fontWeight: 900 }}>
                    <span style={{ color: "#64748b" }}>{label}:</span>
                    <strong>{value}</strong>
                    <span style={{ color: "#2563eb", fontWeight: 950 }}>x</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 10, border: "1px solid rgba(15,118,110,0.18)", borderRadius: 12, padding: "10px 12px", background: "linear-gradient(90deg, #ecfdf5, #ffffff)", color: "#10233f", fontSize: 12, lineHeight: 1.45, fontWeight: 850 }}>
              <strong style={{ color: "#0f766e" }}>Intelligence:</strong> {ceoNarrativeText}
            </div>

            <div style={{ marginBottom: 10, color: "#64748b", fontSize: 11, fontWeight: 850 }}>
              Click a column name to sort. Use the small filter button in each header for precise filters.
            </div>

            <div data-ceo-pnl tabIndex={0} className="ceo-pnl-scroll" style={{ height: isCeoPnLExpanded ? 520 : 368, overflowY: "auto", overflowX: "auto", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 12, background: "#fff", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)", outline: "none" }}>
              <table style={{ width: "100%", minWidth: 1060, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                <thead>
                  <tr>
                    {ceoPnLColumns.map((column, index) => (
                      <th key={column.key} style={{ position: "sticky", top: 0, left: index === 0 ? 0 : "auto", zIndex: index === 0 ? 9 : activeCeoPnLFilter === column.key ? 8 : 2, padding: "10px 12px", textAlign: column.align, color: "#e5f2ff", background: "linear-gradient(180deg, #08264a 0%, #061b35 100%)", borderBottom: "1px solid rgba(148,163,184,0.30)", borderLeft: index === 0 ? 0 : "1px solid rgba(148,163,184,0.20)", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>
                        <span style={{ display: "flex", justifyContent: column.align === "right" ? "flex-end" : "flex-start", alignItems: "center", gap: 7 }}>
                          <button type="button" onClick={() => handleCeoPnLSort(column.key)} style={{ border: 0, padding: 0, background: "transparent", color: "#e5f2ff", cursor: "pointer", fontSize: 11, fontWeight: 950 }}>
                            {column.label} {ceoPnLSort.key === column.key ? (ceoPnLSort.direction === "asc" ? "^" : "v") : ""}
                          </button>
                          {column.filterType !== "none" && (
                            <button type="button" aria-label={`Filter ${column.label}`} onClick={(event) => { event.stopPropagation(); setActiveCeoPnLFilter((current) => current === column.key ? "" : column.key); }} style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, border: `1px solid ${activeCeoPnLFilter === column.key ? "rgba(94,234,212,0.65)" : "rgba(226,242,255,0.30)"}`, borderRadius: 7, background: activeCeoPnLFilter === column.key ? "rgba(20,184,166,0.22)" : "rgba(255,255,255,0.07)", color: "#dbeafe", cursor: "pointer", fontSize: 11, fontWeight: 950 }}>
                              F
                            </button>
                          )}
                          {renderCeoPnLFilterPanel(column)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ceoPnLGroupedRows.map((row, index) => {
                    const isGroup = row.type !== "center";
                    const isCollapsed = Boolean(collapsedCeoPnLGroups[row.key]);
                    const rowBg = row.type === "portfolio" ? "#f1f5ff" : row.type === "hub" ? "#f8fafc" : index % 2 === 0 ? "#ffffff" : "#fbfdff";
                    return (
                    <tr key={row.key} onClick={(event) => { setFocusedCeoPnLIndex(index); handleCeoPnLRowAction(row, event); }} className="ceo-pnl-row" style={{ background: focusedCeoPnLIndex === index ? "#eaf5ff" : rowBg, cursor: "pointer", outline: focusedCeoPnLIndex === index ? "2px solid rgba(37,99,235,0.24)" : "none" }}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, padding: "12px 14px", color: "#10233f", fontWeight: isGroup ? 950 : 850, borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap", background: focusedCeoPnLIndex === index ? "#eaf5ff" : rowBg }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingLeft: row.type === "hub" ? 18 : row.type === "center" ? 38 : 0 }}>
                          {isGroup ? (
                            <button type="button" onClick={() => toggleCeoPnLGroup(row.key)} style={{ width: 22, height: 22, border: "1px solid rgba(148,163,184,0.35)", borderRadius: 7, background: "#fff", color: "#0b2a55", cursor: "pointer", fontWeight: 950 }}>{isCollapsed ? "+" : "-"}</button>
                          ) : <span style={{ width: 22, display: "inline-block" }} />}
                          {row.costCenter}
                          {row.key === ceoWorstPortfolio?.key && <span style={{ color: "#dc2626", background: "#fff1f2", border: "1px solid rgba(220,38,38,0.18)", borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>Worst</span>}
                          {row.key === ceoHighestCostPortfolio?.key && <span style={{ color: "#b45309", background: "#fff7ed", border: "1px solid rgba(180,83,9,0.18)", borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>High Cost</span>}
                          {row.costCenter === ceoHighestRiskCenter?.costCenter && <span style={{ color: "#991b1b", background: "#fef2f2", border: "1px solid rgba(153,27,27,0.18)", borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>Risk</span>}
                          {row.costCenter === ceoBestPerformer?.costCenter && <span style={{ color: "#059669", background: "#ecfdf5", border: "1px solid rgba(5,150,105,0.18)", borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>Best</span>}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#10233f", fontWeight: isGroup ? 950 : 850, textAlign: "right", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>{formatCompactCurrency(row.submitted)}</td>
                      <td style={{ padding: "12px 14px", color: "#10233f", fontWeight: isGroup ? 950 : 850, textAlign: "right", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>{formatCompactCurrency(row.approved)}</td>
                      <td style={{ padding: "12px 14px", color: "#10233f", fontWeight: 950, textAlign: "right", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>{formatCompactCurrency(row.totalCost)}</td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap", textAlign: "right" }}>
                        <strong style={{ color: profitColor(row.net), fontSize: 12 }}>{formatPercent(row.margin)}</strong>
                      </td>
                      <td style={{ padding: "12px 14px", color: profitColor(row.net), fontWeight: 950, textAlign: "right", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>{formatCompactCurrency(row.net)}</td>
                      <td style={{ padding: "12px 14px", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: row.status.color, background: row.status.bg, border: `1px solid ${row.status.color}24`, borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 950 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: row.status.color }} />
                          {row.status.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(226,232,240,0.92)", whiteSpace: "nowrap" }}>
                        <svg viewBox="0 0 64 22" aria-hidden="true" style={{ width: 64, height: 22, display: "block", marginLeft: "auto" }}>
                          {row.sparkline.points && <polyline points={row.sparkline.points} fill="none" stroke={row.sparkline.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
                        </svg>
                      </td>
                    </tr>
                  );})}
                  {filteredCeoPnLRows.length > 0 && (
                    <tr style={{ background: "linear-gradient(90deg, #eef3f8, #f8fafc)" }}>
                      <td style={{ padding: "13px 14px", color: "#0b2a55", fontWeight: 950, borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>TOTAL</td>
                      <td style={{ padding: "13px 14px", color: "#0b2a55", fontWeight: 950, textAlign: "right", borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{formatCompactCurrency(filteredCeoPnLRows.reduce((sum, row) => sum + row.submitted, 0))}</td>
                      <td style={{ padding: "13px 14px", color: "#0b2a55", fontWeight: 950, textAlign: "right", borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{formatCompactCurrency(filteredCeoPnLRows.reduce((sum, row) => sum + row.approved, 0))}</td>
                      <td style={{ padding: "13px 14px", color: "#0b2a55", fontWeight: 950, textAlign: "right", borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{formatCompactCurrency(filteredCeoPnLRows.reduce((sum, row) => sum + row.totalCost, 0))}</td>
                      <td style={{ padding: "13px 14px", color: profitColor(filteredCeoPnLRows.reduce((sum, row) => sum + row.net, 0)), fontWeight: 950, textAlign: "right", borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{formatPercent(filteredCeoPnLRows.reduce((sum, row) => sum + row.approved, 0) ? filteredCeoPnLRows.reduce((sum, row) => sum + row.net, 0) / filteredCeoPnLRows.reduce((sum, row) => sum + row.approved, 0) : 0)}</td>
                      <td style={{ padding: "13px 14px", color: profitColor(filteredCeoPnLRows.reduce((sum, row) => sum + row.net, 0)), fontWeight: 950, textAlign: "right", borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{formatCompactCurrency(filteredCeoPnLRows.reduce((sum, row) => sum + row.net, 0))}</td>
                      <td style={{ padding: "13px 14px", color: "#64748b", fontWeight: 900, borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }}>{filteredCeoPnLRows.length.toLocaleString()} centers</td>
                      <td style={{ padding: "13px 14px", color: "#64748b", fontWeight: 900, borderTop: "1px solid rgba(148,163,184,0.28)", whiteSpace: "nowrap" }} />
                    </tr>
                  )}
                  {!filteredCeoPnLRows.length && (
                    <tr>
                      <td colSpan={8} style={{ padding: 22, textAlign: "center", color: "#64748b", fontWeight: 850 }}>No cost center P&amp;L data matches the current table filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

              </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 16, background: "#fff", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>Portfolio Trend</h3>
                  <span style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>Last visible months</span>
                </div>
                {executiveTrendRows.length ? (
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="CEO report portfolio trend" style={{ width: "100%", height: 150, display: "block" }}>
                    <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                    <polyline points={approvedTrendPoints} fill="none" stroke="#059669" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={costTrendPoints} fill="none" stroke="#f97316" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                    {executiveTrendRows.map((row, index) => {
                      const [approvedX, approvedY] = getTrendPoint(row, index, "approved").split(",");
                      const [costX, costY] = getTrendPoint(row, index, "cost").split(",");
                      return (
                        <g key={`ceo-trend-${row.key}`}>
                          <circle cx={approvedX} cy={approvedY} r="3.4" fill="#059669" stroke="#fff" strokeWidth="1.5" />
                          <circle cx={costX} cy={costY} r="3.4" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
                          <text x={approvedX} y={chartHeight - 4} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="800">{row.label.split(" ")[0]}</text>
                        </g>
                      );
                    })}
                  </svg>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 12 }}>No trend data available.</div>
                )}
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 16, background: "#fff", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>Key Highlights</h3>
                <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  {[
                    ["Top Performer", ceoTopPerformer?.costCenter ?? "N/A", ceoTopPerformer ? formatPercent(ceoTopPerformer.margin) : "-", "#059669"],
                    ["Highest Cost Center", ceoHighestCostCenter?.costCenter ?? "N/A", ceoHighestCostCenter ? formatCompactCurrency(ceoHighestCostCenter.totalCost) : "-", "#f97316"],
                    ["Lowest Margin / Risk", ceoLowestMarginCenter?.costCenter ?? "N/A", ceoLowestMarginCenter ? formatPercent(ceoLowestMarginCenter.margin) : "-", "#dc2626"],
                  ].map(([label, value, metric, color]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", borderBottom: "1px solid rgba(226,232,240,0.86)", paddingBottom: 10 }}>
                      <span>
                        <span style={{ display: "block", color: "#64748b", fontSize: 11, fontWeight: 850 }}>{label}</span>
                        <strong style={{ display: "block", marginTop: 3, color: "#071a3a", fontSize: 14 }}>{value}</strong>
                      </span>
                      <strong style={{ color, fontSize: 13 }}>{metric}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 16, background: "#fff", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>Margin Distribution</h3>
                <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 14, alignItems: "center", marginTop: 12 }}>
                  {(() => {
                    const total = Math.max(ceoPnLRows.length, 1);
                    let cumulative = 0;
                    const gradient = ceoStatusDistribution.map((item) => {
                      const start = cumulative;
                      cumulative += (item.count / total) * 100;
                      return `${item.color} ${start}% ${cumulative}%`;
                    }).join(", ");
                    return (
                      <div style={{ width: 112, height: 112, borderRadius: "50%", background: `conic-gradient(${gradient})`, display: "grid", placeItems: "center" }}>
                        <div style={{ width: 66, height: 66, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", color: "#071a3a", fontWeight: 950, textAlign: "center", lineHeight: 1.15 }}>{ceoPnLRows.length}<br /><span style={{ fontSize: 10, color: "#64748b" }}>Centers</span></div>
                      </div>
                    );
                  })()}
                  <div style={{ display: "grid", gap: 8 }}>
                    {ceoStatusDistribution.map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#10233f", fontSize: 12, fontWeight: 850 }}>
                        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: item.color, marginRight: 7 }} />{item.label}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div style={{ marginTop: 14, border: "1px solid rgba(124,58,237,0.22)", borderRadius: 12, padding: 16, background: "linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.42fr)", gap: 14, alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 15, fontWeight: 950 }}>Margin Impact from Head Office Allocation</h3>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>Margins include the selected cost basis and CN adjustments where applicable.</p>
              </div>
              <div style={{ color: "#071a3a", fontSize: 13, lineHeight: 1.55 }}>
                <strong>Insight:</strong> Current fully loaded margin is <strong style={{ color: profitColor(ceoReportTotals.netProfit) }}>{formatPercent(ceoReportMargin)}</strong>. {ceoLowestMarginCenter ? `${ceoLowestMarginCenter.costCenter} is the lowest-margin center and should be reviewed first.` : "No margin risk center is available."}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setIsCeoPnLExpanded((current) => !current)}
                style={{ border: "1px solid rgba(37,99,235,0.24)", borderRadius: 10, padding: "10px 14px", background: "#eff6ff", color: "#0b4db3", cursor: "pointer", fontSize: 12, fontWeight: 950, boxShadow: "0 8px 20px rgba(37,99,235,0.10)" }}
              >
                {isCeoPnLExpanded ? "Show compact view" : "View all cost centers"}
              </button>
            </div>
          </section>

          {selectedCeoPnLRow && (
            <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15,23,42,0.26)", display: "flex", justifyContent: "flex-end" }} onClick={() => setSelectedCeoPnLRow(null)}>
              <aside onClick={(event) => event.stopPropagation()} style={{ width: "min(430px, 94vw)", height: "100%", overflowY: "auto", background: "#ffffff", borderLeft: "1px solid rgba(148,163,184,0.32)", boxShadow: "-24px 0 70px rgba(15,23,42,0.26)", padding: 22, boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{selectedCeoPnLRow.type === "portfolio" ? "Portfolio Summary" : selectedCeoPnLRow.type === "hub" ? "Hub Breakdown" : "Cost Center Financials"}</div>
                    <h3 style={{ margin: "5px 0 0", color: "#071a3a", fontSize: 22, fontWeight: 950 }}>{selectedCeoPnLRow.costCenter}</h3>
                    <div style={{ marginTop: 5, color: "#64748b", fontSize: 12 }}>{selectedCeoPnLRow.childCount ? `${selectedCeoPnLRow.childCount} cost centers` : selectedCeoPnLRow.hub || selectedCeoPnLRow.portfolio || "Selected row"}</div>
                  </div>
                  <button type="button" onClick={() => setSelectedCeoPnLRow(null)} style={{ border: "1px solid rgba(148,163,184,0.36)", borderRadius: 10, background: "#f8fafc", color: "#10233f", width: 34, height: 32, cursor: "pointer", fontWeight: 950 }}>x</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Submitted AFP", selectedCeoPnLRow.submitted, "#2563eb"],
                    ["Approved AFP", selectedCeoPnLRow.approved, "#059669"],
                    ["Total Cost", selectedCeoPnLRow.totalCost, "#f97316"],
                    ["Net Profit", selectedCeoPnLRow.net, profitColor(selectedCeoPnLRow.net)],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ border: `1px solid ${color}22`, borderRadius: 12, padding: 12, background: `${color}0b` }}>
                      <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                      <strong style={{ display: "block", marginTop: 6, color, fontSize: 18 }}>{formatCompactCurrency(value)}</strong>
                    </div>
                  ))}
                </div>
                <section style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <h4 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>Margin Before / After HO</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginTop: 12 }}>
                    <strong style={{ color: "#0f766e", fontSize: 20 }}>{formatPercent(selectedCeoPnLRow.margin + 0.053)}</strong>
                    <span style={{ color: "#94a3b8", fontWeight: 950 }}>→</span>
                    <strong style={{ color: profitColor(selectedCeoPnLRow.net), fontSize: 20 }}>{formatPercent(selectedCeoPnLRow.margin)}</strong>
                  </div>
                </section>
                {ceoViewType === "project" && (
                  <section style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                    <h4 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>CN Details</h4>
                    <div style={{ display: "grid", gap: 8, marginTop: 10, color: "#10233f", fontSize: 13, fontWeight: 850 }}>
                      <span>Received CN: <strong style={{ color: "#059669" }}>{formatCompactCurrency(selectedCeoPnLRow.cnReceived || 0)}</strong></span>
                      <span>Issued CN: <strong style={{ color: "#dc2626" }}>{formatCompactCurrency(selectedCeoPnLRow.cnIssued || 0)}</strong></span>
                      <span>Net CN: <strong>{formatCompactCurrency((selectedCeoPnLRow.cnReceived || 0) - (selectedCeoPnLRow.cnIssued || 0))}</strong></span>
                    </div>
                  </section>
                )}
                <section style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: 14 }}>
                  <h4 style={{ margin: 0, color: "#071a3a", fontSize: 14, fontWeight: 950 }}>Trend Chart</h4>
                  <svg viewBox="0 0 240 72" aria-hidden="true" style={{ width: "100%", height: 88, marginTop: 10 }}>
                    {selectedCeoPnLRow.sparkline?.points && <polyline points={selectedCeoPnLRow.sparkline.points.split(" ").map((point) => {
                      const [x, y] = point.split(",").map(Number);
                      return `${x * 3.3},${y * 2.4}`;
                    }).join(" ")} fill="none" stroke={selectedCeoPnLRow.sparkline.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
                  </svg>
                </section>
              </aside>
            </div>
          )}

          {false && (
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(280px, 0.82fr) minmax(0, 1.18fr)", gap: 16, alignItems: "stretch", marginBottom: 22 }}>
            <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${profitColor(revenueSurplus)}33`, borderRadius: 14, padding: "22px 22px", background: `linear-gradient(145deg, #ffffff 0%, ${revenueSurplus >= 0 ? "#f1fdf8" : "#fff5f5"} 100%)`, boxShadow: "0 16px 34px rgba(15,23,42,0.10)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
              <div style={{ position: "absolute", right: -30, bottom: -30, width: 130, height: 130, borderRadius: "50%", background: `${profitColor(revenueSurplus)}14` }} />
              {(() => {
                const netTrend = getMiniTrend("net", 132, 52, 6);
                return (
                  <div style={{ position: "absolute", right: 16, bottom: 18, width: 132, height: 52, opacity: 0.24 }}>
                    <svg viewBox="0 0 132 52" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
                      {netTrend.points && (
                        <>
                          <polyline points={netTrend.points} fill="none" stroke={profitColor(revenueSurplus)} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                          {netTrend.latest && <circle cx={netTrend.latest.x} cy={netTrend.latest.y} r="3.5" fill={profitColor(revenueSurplus)} stroke="#fff" strokeWidth="1.5" />}
                        </>
                      )}
                    </svg>
                  </div>
                );
              })()}
              <div style={{ color: "#334155", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Net Position</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 7, whiteSpace: "nowrap" }}>
                <strong style={{ color: profitColor(revenueSurplus), fontSize: 34, lineHeight: 1, fontWeight: 950 }}>{formatCompactCurrency(revenueSurplus)}</strong>
                {(() => {
                  const change = getKpiChange("net");
                  return <span style={{ color: change.color, opacity: change.muted ? 0.58 : 1, fontSize: change.muted ? 11 : 13, fontWeight: 950 }}>{change.arrow} {change.text}</span>;
                })()}
              </div>
              <div style={{ marginTop: 5, color: theme.subtext, fontSize: 11 }}>Approved AFP - Cost</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 6 }}>
                <span style={{ color: profitColor(revenueSurplus), fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{revenueSurplus >= 0 ? "Positive" : "Loss"}</span>
                <span style={{ color: theme.subtext, fontSize: 10 }}>Current filtered position</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
                {[
                  ["Total Cost", formatCompactCurrency(visibleTotal), getKpiChange("cost", true), "#2563eb", "cost"],
                  ["Approved AFP", formatCompactCurrency(approvedRevenue), getKpiChange("approved"), "#059669", "approved"],
                  ["Margin / Coverage", formatPercent(approvedRevenue ? revenueSurplus / approvedRevenue : 0), { arrow: "", text: `Coverage ${formatPercent(costCoverage)}`, color: costCoverage >= 1 ? "#059669" : "#dc2626", muted: false }, costCoverage >= 1 ? "#059669" : "#dc2626", "margin"],
                ].map(([label, value, change, accent, trendField]) => {
                  const miniTrend = getMiniTrend(trendField);
                  return (
                    <div key={label} style={{ position: "relative", overflow: "hidden", border: `1px solid ${accent}20`, borderRadius: 14, padding: "18px 18px", background: `linear-gradient(145deg, #ffffff 0%, ${accent}0d 100%)`, minWidth: 0, boxShadow: "0 14px 30px rgba(15,23,42,0.08)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                      <div style={{ position: "absolute", right: 12, bottom: 10, width: 110, height: 44, opacity: 0.32 }}>
                        <svg viewBox="0 0 110 44" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
                          {miniTrend.points && (
                            <>
                              <polyline points={miniTrend.points} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              {miniTrend.latest && <circle cx={miniTrend.latest.x} cy={miniTrend.latest.y} r="3.2" fill={accent} stroke="#fff" strokeWidth="1.5" />}
                            </>
                          )}
                        </svg>
                      </div>
                      <div style={{ color: "#334155", fontSize: 10, lineHeight: 1, fontWeight: 950, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 10 }}>{label}</div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 7, whiteSpace: "nowrap", minHeight: 18 }}>
                        <strong style={{ color: accent === theme.accentWarm ? "#2563eb" : accent, fontSize: 24, lineHeight: 1, fontWeight: 950 }}>{value}</strong>
                        <span style={{ color: change.color, opacity: change.muted ? 0.58 : 1, fontSize: change.muted ? 10 : 12, lineHeight: 1, fontWeight: change.muted ? 800 : 950 }}>{change.arrow} {change.text}</span>
                      </div>
                      <div style={{ marginTop: 10, color: "#64748b", opacity: 0.85, fontSize: 11, lineHeight: 1 }}>{change.muted ? "Actual monthly trend" : "vs previous month"}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ color: "#334155", fontSize: 14, fontWeight: 900, display: "flex", gap: 18, flexWrap: "wrap", padding: "14px 18px", alignItems: "center", justifyContent: "center", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, background: "rgba(255,255,255,0.76)", boxShadow: "0 10px 24px rgba(15,23,42,0.05)" }}>
                <span>Scope: <strong style={{ color: "#0f766e" }}>{executiveScopeLabel}</strong></span>
                <span style={{ color: "#cbd5e1" }}>|</span>
                <span>Period: <strong style={{ color: "#2563eb" }}>{filters.month || filters.year || "All months"}</strong></span>
              </div>
            </div>
          </div>
          )}

          {false && isAdjustedCostActive && (
          <section style={{ marginBottom: 22, border: "1px solid rgba(148,163,184,0.25)", borderRadius: 16, padding: 20, background: "#fff", boxShadow: "0 16px 38px rgba(15,23,42,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: "#071a3a", fontSize: 20, fontWeight: 950 }}>Credit Note Cost Flow</h2>
                <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Internal reallocation only. Applied at hub and cost center level.</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.72fr) minmax(0, 1.28fr)", gap: 16 }}>
              <div style={{ border: "1px solid rgba(148,163,184,0.24)", borderRadius: 14, padding: 18, background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)" }}>
                <div style={{ color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Workshop Cost Flow</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 10, alignItems: "center", marginTop: 16 }}>
                  {[
                    ["Issued", cnIssuedTotal, "#dc2626"],
                    ["Received", cnReceivedTotal, "#059669"],
                    ["Net", cnNetImpact, cnNetImpact >= 0 ? "#dc2626" : "#059669"],
                  ].map(([label, value, color], index) => (
                    <Fragment key={label}>
                      <div style={{ textAlign: "center", border: `1px solid ${color}24`, borderRadius: 14, padding: "15px 10px", background: `${color}0d` }}>
                        <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                        <div style={{ marginTop: 7, color, fontSize: 20, fontWeight: 950 }}>{formatCompactCurrency(value)}</div>
                      </div>
                      {index < 2 && <div style={{ color: "#94a3b8", fontWeight: 950 }}>-&gt;</div>}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ margin: "0 0 10px", color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Top Receiving Cost Centers</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {topCreditReceivingCenters.map((row, index) => {
                    const width = `${Math.max(4, (row.cnReceived / (maxTopCreditReceived || 1)) * 100)}%`;
                    return (
                      <div key={row.costCenter} className="executive-hover-card" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.55fr) minmax(0, 1fr) 138px", gap: 10, alignItems: "center", border: "1px solid rgba(148,163,184,0.24)", borderRadius: 12, padding: "11px 12px", background: "#f8fafc", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                        <div>
                          <strong style={{ color: "#10233f" }}>{index + 1}. {row.costCenter}</strong>
                        </div>
                        <div style={{ height: 11, borderRadius: 999, background: "#e5edf5", overflow: "hidden" }}>
                          <div style={{ width, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0f766e, #2563eb)" }} />
                        </div>
                        <div style={{ textAlign: "right", color: "#0f766e", fontWeight: 950 }}>{formatCompactCurrency(row.cnReceived)}</div>
                      </div>
                    );
                  })}
                  {!topCreditReceivingCenters.length && <div style={{ color: theme.subtext }}>No receiving cost centers match the current filters.</div>}
                </div>
              </div>
            </div>
          </section>
          )}

          <section style={{ marginBottom: 16 }}>
            {renderExecutiveInsights(strategicInsightTitle, dynamicStrategicInsights)}
          </section>

          <div style={{ display: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: "#071a3a", fontSize: 18, fontWeight: 950 }}>{insightContextLabel}</h3>
              <span style={{ color: "#0f766e", background: "#ecfdf5", border: "1px solid rgba(15,118,110,0.16)", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>View All Insights</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
              {keyInsights.slice(0, 4).map((insight) => (
                <div key={insight.label} style={{ position: "relative", overflow: "hidden", border: `1px solid ${insight.color}22`, borderRadius: 14, padding: "18px 18px", background: `linear-gradient(145deg, #ffffff 0%, ${insight.color}0b 100%)`, color: "#64748b", fontSize: 0, lineHeight: 1.3, minWidth: 0, minHeight: 130, boxSizing: "border-box", boxShadow: "0 14px 32px rgba(15,23,42,0.08)" }}>
                  <span style={{ display: "inline-grid", placeItems: "center", width: 42, height: 36, borderRadius: 10, color: insight.color, background: `${insight.color}12`, fontSize: 12, fontWeight: 950, lineHeight: 1, marginBottom: 12 }}>{insight.icon}</span>
                  <span style={{ color: insight.color, fontSize: 0, fontWeight: 950, lineHeight: 1.15 }}>•</span>
                  <span style={{ display: "block", fontSize: 12 }}>
                    <strong style={{ display: "block", color: theme.subtext, fontSize: 10, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{insight.label}</strong>
                    <span style={{ display: "block", marginTop: 6, color: insight.color, fontSize: 16, lineHeight: 1.1, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{insight.value}</span>
                    <span style={{ display: "block", marginTop: 5, color: theme.subtext, fontSize: 11, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{insight.detail}</span>
                  </span>
                  <span style={{ color: insight.color, fontWeight: 950 }}>•</span>{" "}
                  <strong style={{ color: theme.text }}>{insight.label}: </strong>
                  <span style={{ color: theme.text, fontWeight: 850 }}>{insight.value}</span>
                  <span> — {insight.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", margin: "10px 0 14px" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Why It Is Happening</div>
              <h2 style={{ margin: "4px 0 0", color: "#071a3a", fontSize: 20, fontWeight: 950 }}>Cost &amp; Performance Drivers</h2>
              <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Trend, hub concentration, and GL cost drivers behind the profitability summary above.</p>
            </div>
            {latestTrendRow && (
              <span style={{ color: profitColor(latestTrendRow.net), background: "#f8fafc", border: "1px solid rgba(148,163,184,0.22)", borderRadius: 999, padding: "9px 13px", fontSize: 12, fontWeight: 950 }}>
                Latest {latestTrendRow.label}: {formatCompactCurrency(latestTrendRow.cost)} cost vs {formatCompactCurrency(latestTrendRow.approved)} approved
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 22, background: "#fff", minHeight: 320, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <div>
                  <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Monthly Trend</h3>
                  <div style={{ marginTop: 5, color: costTrendDelta > 0 ? "#dc2626" : costTrendDelta < 0 ? "#059669" : "#64748b", fontSize: 12, fontWeight: 950 }}>
                    {costTrendDelta > 0 ? "▲ Increasing" : costTrendDelta < 0 ? "▼ Decreasing" : "— Stable"} cost movement
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, color: "#64748b", fontSize: 11, alignItems: "center" }}>
                  <span><strong style={{ color: theme.accentWarm }}>Cost</strong></span>
                  <span><strong style={{ color: "#059669" }}>Approved AFP</strong></span>
                </div>
              </div>
              {executiveTrendRows.length ? (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Monthly trend line chart comparing cost and approved AFP" style={{ width: "100%", height: 220, display: "block", marginTop: 8 }}>
                  <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                  <polyline points={costTrendPoints} fill="none" stroke={theme.accentWarm} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={approvedTrendPoints} fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  {executiveTrendRows.map((row, index) => {
                    const [costX, costY] = getTrendPoint(row, index, "cost").split(",");
                    const [approvedX, approvedY] = getTrendPoint(row, index, "approved").split(",");
                    const isLastPoint = index === executiveTrendRows.length - 1;
                    return (
                      <g key={row.key}>
                        {isLastPoint && (
                          <>
                            <circle cx={costX} cy={costY} r="12" fill={theme.accentWarm} opacity="0.16" />
                            <circle cx={approvedX} cy={approvedY} r="12" fill="#059669" opacity="0.16" />
                          </>
                        )}
                        <circle cx={costX} cy={costY} r={isLastPoint ? "6" : "3.5"} fill={theme.accentWarm} stroke="#fff" strokeWidth="2" />
                        <circle cx={approvedX} cy={approvedY} r={isLastPoint ? "6" : "3.5"} fill="#059669" stroke="#fff" strokeWidth="2" />
                        <text x={costX} y={chartHeight - 4} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700">{row.label.split(" ")[0]}</text>
                        {isLastPoint && (
                          <text x={approvedX} y={Math.max(12, Number(approvedY) - 10)} textAnchor="middle" fill="#059669" fontSize="10" fontWeight="900">Latest</text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div style={{ color: theme.subtext }}>No trend information matches the current filters.</div>
              )}
            </div>

            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 18, background: "#fff", minHeight: 250, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 4 }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Cost by Hub</h3>
                {hubHistogramRows[0] && <span style={{ color: "#b45309", background: "#fff7ed", border: "1px solid rgba(180,83,9,0.20)", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 950 }}>Highest cost: {hubHistogramRows[0].label}</span>}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {hubHistogramRows.slice(0, 8).map((hub, index) => {
                  const section = HUB_SECTIONS.find((item) => item.hubs.includes(hub.label));
                  const contribution = visibleTotal ? hub.amount / visibleTotal : 0;
                  const accent = contribution >= 0.35 ? theme.danger : contribution >= 0.2 ? theme.accentWarm : section?.accent ?? theme.accentStrong;
                  const width = `${Math.max(3, (Math.abs(hub.amount) / (maxHubHistogramAmount || 1)) * 100)}%`;

                  return (
                    <div key={hub.label} style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 150px", gap: 8, alignItems: "center", padding: index === 0 ? "8px 10px" : "2px 0", border: index === 0 ? `1px solid ${accent}24` : "1px solid transparent", borderRadius: 10, background: index === 0 ? `${accent}0b` : "transparent" }}>
                      <span style={{ color: accent, fontSize: 12, fontWeight: index === 0 ? 950 : 900 }}>{hub.label}</span>
                      <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                      </div>
                      <span style={{ color: index === 0 ? accent : theme.text, fontSize: 12, fontWeight: index === 0 ? 950 : 900, textAlign: "right" }}>{formatCompactCurrency(hub.amount)} <span style={{ color: index === 0 ? accent : theme.subtext, fontSize: 10, fontWeight: 950 }}>{formatPercent(contribution)}</span></span>
                    </div>
                  );
                })}
                {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub performance matches the current filters.</div>}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 18, background: "#fff", minHeight: 210, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Cost by GL Name</h3>
                {costByGlRows[0] && <span style={{ color: theme.accentStrong, background: "#ecfdf5", border: "1px solid rgba(15,118,110,0.18)", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 950 }}>Top Driver: {costByGlRows[0].glName}</span>}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {costByGlRows.slice(0, 7).map((row, index) => (
                  <div key={row.glName} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.8fr) minmax(0, 1fr) 150px", gap: 12, alignItems: "center", padding: index === 0 ? "8px 10px" : "2px 0", border: index === 0 ? `1px solid ${theme.accentStrong}24` : "1px solid transparent", borderRadius: 10, background: index === 0 ? `${theme.accentStrong}0b` : "transparent" }}>
                    <span style={{ color: index === 0 ? theme.accentStrong : theme.text, fontSize: 12, fontWeight: index === 0 ? 950 : 850, overflowWrap: "anywhere" }}>{row.glName}</span>
                    <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxGlCost || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: index === 0 ? "linear-gradient(90deg, #0f766e, #14b8a6)" : "#0e7490" }} />
                    </div>
                    <span style={{ color: index === 0 ? theme.accentStrong : theme.text, fontSize: 12, fontWeight: index === 0 ? 950 : 900, textAlign: "right" }}>{formatCompactCurrency(row.cost)} <span style={{ color: theme.subtext, fontSize: 10 }}>({formatPercent(visibleTotal ? row.cost / visibleTotal : 0)})</span></span>
                  </div>
                ))}
                {!costByGlRows.length && <div style={{ color: theme.subtext }}>No GL cost performance matches the current filters.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === "legacy-overview" && (
        <div style={{ marginBottom: 18, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, boxShadow: theme.cardShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 24, fontWeight: 950, letterSpacing: 0 }}>CEO Commercial Cockpit</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Executive view of commercial health, risk exposure, and portfolio movement.</p>
            </div>
            {renderPeriodToggleFor(overviewPeriodView, setOverviewPeriodView)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 360px), 1.05fr) minmax(min(100%, 520px), 1.35fr)", gap: 14, marginBottom: 14 }}>
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 8, padding: 22, color: "#fff", background: `linear-gradient(135deg, ${commercialHealth.color}, #12324f)`, boxShadow: "0 18px 42px rgba(15,23,42,0.16)" }}>
              <div style={{ position: "absolute", right: -60, top: -60, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.82, textTransform: "uppercase" }}>Commercial Health</div>
                  <span style={{ color: "#fff", background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 950 }}>{commercialHealth.label}</span>
                </div>
                <div style={{ marginTop: 20, fontSize: 13, opacity: 0.82, fontWeight: 850 }}>Commercial Result</div>
                <div style={{ marginTop: 5, fontSize: 34, lineHeight: 1, fontWeight: 950, overflowWrap: "anywhere" }}>{formatCurrency(revenueSurplus)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 950 }}>{formatPercent(recoveryRatio)}</div>
                    <div style={{ fontSize: 12, opacity: 0.78 }}>Recovery</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 950 }}>{formatCurrency(approvalGap)}</div>
                    <div style={{ fontSize: 12, opacity: 0.78 }}>Approval Gap</div>
                  </div>
                </div>
                <p style={{ margin: "18px 0 0", color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 1.45 }}>{executiveInsight}</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>
              {[
                ["Best Portfolio", bestPortfolio?.label ?? "N/A", bestPortfolio ? formatPercent(bestPortfolio.recovery) : "0.0%", bestPortfolio?.accent ?? theme.accentStrong, "Strongest recovery"],
                ["Weakest Portfolio", weakestPortfolio?.label ?? "N/A", weakestPortfolio ? formatPercent(weakestPortfolio.recovery) : "0.0%", weakestPortfolio?.accent ?? theme.danger, "Lowest recovery"],
                ["Highest Spend Hub", highestSpendHub?.label ?? "N/A", highestSpendHub ? formatCurrency(highestSpendHub.amount) : "$0.00", theme.accentWarm, "Largest exposure"],
                [
                  "Hub Cost vs Rev",
                  highestCostRevenueHub?.label ?? "N/A",
                  highestCostRevenueHub ? formatCostRevenueBurden(highestCostRevenueHub) : "0.0x",
                  theme.danger,
                  highestCostRevenueHub ? `${formatCurrency(highestCostRevenueHub.amount)} cost | ${formatCurrency(highestCostRevenueHub.approved)} approved` : "No hub performance",
                ],
                [
                  "Center Cost vs Rev",
                  highestCostRevenueCenter?.label ?? "N/A",
                  highestCostRevenueCenter ? formatCostRevenueBurden(highestCostRevenueCenter) : "0.0x",
                  "#dc2626",
                  highestCostRevenueCenter ? `${highestCostRevenueCenter.hub} | ${formatCurrency(highestCostRevenueCenter.amount)} cost` : "No center performance",
                ],
                ["Approval Gap", largestApprovalGapHub?.label ?? "No gap", largestApprovalGapHub ? formatCurrency(largestApprovalGapHub.approvalGap) : "$0.00", "#2563eb", "Pending value"],
                ["Lowest Recovery", lowestRecoveryHub?.label ?? "N/A", lowestRecoveryHub ? formatPercent(lowestRecoveryHub.recovery) : "0.0%", theme.danger, "Needs attention"],
              ].map(([label, value, detail, accent, note]) => (
                <div key={label} style={{ border: `1px solid ${theme.border}`, borderTop: `4px solid ${accent}`, borderRadius: 8, padding: 13, background: theme.inputBg, boxShadow: "0 8px 20px rgba(15,23,42,0.04)" }}>
                  <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 8, color: theme.text, fontSize: 16, fontWeight: 950, lineHeight: 1.1 }}>{value}</div>
                  <div style={{ marginTop: 7, color: theme.subtext, fontSize: 12, fontWeight: 800 }}>{detail}</div>
                  <div style={{ marginTop: 7, color: accent, fontSize: 11, fontWeight: 900 }}>{note}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 420px), 1.25fr) minmax(min(100%, 300px), 0.75fr)", gap: 14, marginBottom: 14 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, background: themeMode === "light" ? "#f8fbfd" : theme.inputBg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: 17, fontWeight: 950 }}>Hub Cost Exposure</h3>
                  <p style={{ margin: "4px 0 0", color: theme.subtext, fontSize: 12 }}>Accumulated cost by hub for the current view</p>
                </div>
                <strong style={{ color: theme.text }}>{formatCurrency(visibleTotal)}</strong>
              </div>
              <div style={{ display: "grid", gap: 12, minHeight: 210, alignContent: "center" }}>
                {hubHistogramRows.map((hub) => {
                  const section = HUB_SECTIONS.find((item) => item.hubs.includes(hub.label));
                  const accent = section?.accent ?? theme.accentStrong;
                  const width = `${Math.max(3, (Math.abs(hub.amount) / (maxHubHistogramAmount || 1)) * 100)}%`;

                  return (
                    <div key={hub.label} style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr) 135px", gap: 10, alignItems: "center" }}>
                      <span style={{ color: theme.text, fontSize: 12, fontWeight: 900 }}>{hub.label}</span>
                      <div style={{ height: 22, borderRadius: 999, background: theme.accentSoft, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(15,23,42,0.08)" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${accent}, ${accent}bb)` }} />
                      </div>
                      <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCurrency(hub.amount)}</span>
                    </div>
                  );
                })}
                {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub cost performance matches the current filters.</div>}
              </div>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, background: themeMode === "light" ? "#f8fbfd" : theme.inputBg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 17, fontWeight: 950 }}>Commercial Mix</h3>
              <p style={{ margin: "4px 0 12px", color: theme.subtext, fontSize: 12 }}>Approved AFP against submitted AFP</p>
              <div style={{ display: "grid", placeItems: "center" }}>
                <svg viewBox="0 0 150 150" role="img" aria-label="Commercial mix donut chart" style={{ width: 205, maxWidth: "100%" }}>
                  <circle cx="75" cy="75" r="52" fill="none" stroke={theme.accentSoft} strokeWidth="18" />
                  <circle cx="75" cy="75" r="52" fill="none" stroke="#059669" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${donutSubmittedShare * 3.27} 327`} transform="rotate(-90 75 75)" />
                  <text x="75" y="70" textAnchor="middle" fill={theme.text} fontSize="22" fontWeight="900">{donutSubmittedShare.toFixed(1)}%</text>
                  <text x="75" y="91" textAnchor="middle" fill={theme.subtext} fontSize="11" fontWeight="700">approved</text>
                </svg>
              </div>
              <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
                {[
                  ["Submitted", submittedRevenue, "#2563eb"],
                  ["Approved", approvedRevenue, "#059669"],
                  ["Cost", visibleTotal, theme.accentWarm],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: theme.subtext, fontSize: 12, marginBottom: 4 }}>
                      <span>{label}</span>
                      <strong style={{ color: theme.text }}>{formatCurrency(value)}</strong>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (value / maxCommercialValue) * 100)}%`, height: "100%", borderRadius: 999, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 14 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, background: themeMode === "light" ? "#f8fbfd" : theme.inputBg }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 17, fontWeight: 950 }}>Portfolio Recovery</h3>
              <p style={{ margin: "4px 0 14px", color: theme.subtext, fontSize: 12 }}>Approved revenue compared with cost by portfolio</p>
              <div style={{ display: "grid", gap: 12 }}>
                {portfolioSummaries.map((portfolio) => (
                  <div key={portfolio.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: theme.text, fontSize: 13, fontWeight: 850, marginBottom: 6 }}>
                      <span style={{ color: portfolio.accent }}>{portfolio.label}</span>
                      <span>{formatPercent(portfolio.recovery)}</span>
                    </div>
                    <div style={{ display: "grid", gap: 5 }}>
                      <div style={{ height: 11, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(3, (portfolio.cost / (maxPortfolioCost || 1)) * 100)}%`, height: "100%", background: portfolio.accent, borderRadius: 999 }} />
                      </div>
                      <div style={{ color: theme.subtext, fontSize: 12 }}>{formatCurrency(portfolio.cost)} cost | {formatCurrency(portfolio.approved)} approved</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, background: themeMode === "light" ? "#f8fbfd" : theme.inputBg }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 17, fontWeight: 950 }}>Spend by Period</h3>
              <p style={{ margin: "4px 0 14px", color: theme.subtext, fontSize: 12 }}>Cost distribution by {overviewPeriodView} view</p>
              <div style={{ display: "grid", gap: 10 }}>
                {chartPeriods.map((period) => (
                  <div key={period.key} style={{ display: "grid", gridTemplateColumns: "78px minmax(0, 1fr) 118px", gap: 10, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{period.label}</span>
                    <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(period.amount) / (maxChartPeriodAmount || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentStrong }} />
                    </div>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850, textAlign: "right" }}>{formatCurrency(period.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === "cost" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Cost Analysis</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Cost concentration by GL name and movement by month.</p>
            </div>
            <strong style={{ color: theme.text }}>{formatCurrency(visibleTotal)}</strong>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 430px), 1fr) minmax(min(100%, 430px), 1fr)", gap: 14 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Cost by GL Name</h3>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {costByGlRows.slice(0, 12).map((row) => (
                  <div key={row.glName} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(0, 1fr) 120px", gap: 10, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850, overflowWrap: "anywhere" }}>{row.glName}</span>
                    <div style={{ height: 11, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxGlCost || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentStrong }} />
                    </div>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCurrency(row.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Monthly Breakdown</h3>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {monthlyCommercialRows.slice(-12).map((row) => (
                  <div key={row.key} style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr) 120px", gap: 10, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{row.label}</span>
                    <div style={{ height: 11, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxTrendValue || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentWarm }} />
                    </div>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCurrency(row.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === "centers" && (
        <div style={panelStyle}>
          <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Cost Center Performance</h2>
          <p style={{ margin: "5px 0 16px", color: theme.subtext, fontSize: 13 }}>Ranking by cost with submitted AFP, approved AFP, gap, and net position.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Cost Center</th>
                  <th style={leftHeaderStyle}>Hub</th>
                  <th style={tableHeaderStyle}>Cost</th>
                  <th style={tableHeaderStyle}>Submitted AFP</th>
                  <th style={tableHeaderStyle}>Approved AFP</th>
                  <th style={tableHeaderStyle}>Gap</th>
                  <th style={tableHeaderStyle}>Net Position</th>
                  <th style={tableHeaderStyle}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {centerSummaryRows.map((row) => (
                  <tr key={row.costCenter}>
                    <td style={leftCellStyle}>{row.costCenter}</td>
                    <td style={leftCellStyle}>{row.hub}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.submitted)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.approved)}</td>
                    <td style={{ ...tableCellStyle, color: row.gap > 0 ? theme.accentWarm : theme.accentStrong, fontWeight: 800 }}>{formatCurrency(row.gap)}</td>
                    <td style={{ ...tableCellStyle, color: profitColor(row.net), fontWeight: 900 }}>{formatCurrency(row.net)}</td>
                    <td style={tableCellStyle}>{formatPercent(row.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePage === "portfolio" && (
        <div style={panelStyle}>
          <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Portfolio Performance</h2>
          <p style={{ margin: "5px 0 16px", color: theme.subtext, fontSize: 13 }}>Basra, Kirkuk, and Head Office shown through the IGCC portfolio structure.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14 }}>
            {portfolioPerformanceRows.map((row) => (
              <div key={row.label} style={{ border: `1px solid ${theme.border}`, borderTop: `4px solid ${row.accent}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
                <h3 style={{ margin: 0, color: row.accent, fontSize: 18 }}>{row.label}</h3>
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {[
                    ["Cost", row.cost],
                    ["Submitted", row.submitted],
                    ["Approved", row.approved],
                    ["Net Position", row.net],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: theme.subtext, fontSize: 13 }}>
                      <span>{label}</span>
                      <strong style={{ color: label === "Net Position" ? profitColor(value) : theme.text }}>{formatCurrency(value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePage === "hub" && (
        <div style={panelStyle}>
          <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Hub Performance</h2>
          <p style={{ margin: "5px 0 16px", color: theme.subtext, fontSize: 13 }}>Hub-level commercial performance before drilling into individual cost centers.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Hub</th>
                  <th style={leftHeaderStyle}>Portfolio</th>
                  <th style={tableHeaderStyle}>Cost</th>
                  <th style={tableHeaderStyle}>Submitted</th>
                  <th style={tableHeaderStyle}>Approved</th>
                  <th style={tableHeaderStyle}>Gap</th>
                  <th style={tableHeaderStyle}>Net Position</th>
                  <th style={tableHeaderStyle}>Centers</th>
                </tr>
              </thead>
              <tbody>
                {hubPerformanceSummaryRows.map((row) => (
                  <tr key={row.hub}>
                    <td style={leftCellStyle}>{row.hub}</td>
                    <td style={leftCellStyle}>{row.portfolio}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.submitted)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.approved)}</td>
                    <td style={{ ...tableCellStyle, color: row.gap > 0 ? theme.accentWarm : theme.accentStrong }}>{formatCurrency(row.gap)}</td>
                    <td style={{ ...tableCellStyle, color: profitColor(row.net), fontWeight: 900 }}>{formatCurrency(row.net)}</td>
                    <td style={tableCellStyle}>{row.centers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePage === "afp" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Commercial Approval Overview</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Decision view for pending approvals, approval performance, and commercial action priorities.</p>
            </div>
            <strong style={{ color: approvalRate >= 0.85 ? theme.accentStrong : theme.accentWarm }}>{formatPercent(approvalRate)} approval rate</strong>
          </div>

          {renderExecutiveInsights("Approval Narrative", afpInsights)}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 14 }}>
            {[
              ["Submitted AFP", formatCompactCurrency(submittedRevenue), "Under approval pipeline", "SA", "#2563eb"],
              ["Approved AFP", formatCompactCurrency(approvedRevenue), "Recognized commercial value", "AA", theme.accentStrong],
              ["Pending Approval", formatCompactCurrency(approvalGap), "Submitted less approved", "PA", approvalGap > 0 ? theme.danger : theme.accentStrong],
              ["Approval Rate", formatPercent(approvalRate), "Approved / submitted", "AR", approvalRate >= 0.85 ? theme.accentStrong : theme.accentWarm],
            ].map(([label, value, detail, icon, accent]) => (
              <div className="executive-hover-card" key={label} style={{ position: "relative", overflow: "hidden", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.08)", transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: `${accent}14`, color: accent, fontSize: 13, fontWeight: 950 }}>{icon}</span>
                  <div>
                    <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 7, color: accent, fontSize: 24, lineHeight: 1, fontWeight: 950, whiteSpace: "nowrap" }}>{value}</div>
                    <div style={{ marginTop: 9, color: theme.subtext, fontSize: 12 }}>{detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 12, marginBottom: 12 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Monthly Approval Gap</h3>
                <span style={{ color: theme.subtext, fontSize: 11, fontWeight: 900 }}>Submitted - Approved</span>
              </div>
              <div style={{ display: "grid", gap: 9 }}>
                {afpTrendRows.map((row) => {
                  const gap = row.submitted - row.approved;
                  const isRisk = gap > 0;
                  const width = `${Math.max(3, (Math.abs(gap) / (maxAfpGap || 1)) * 100)}%`;

                  return (
                    <div key={row.key} style={{ display: "grid", gridTemplateColumns: "78px minmax(0, 1fr) 112px", gap: 9, alignItems: "center" }}>
                      <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{row.label}</span>
                      <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: isRisk ? theme.danger : theme.accentStrong, opacity: isRisk && gap > approvalGap / 6 ? 1 : 0.72 }} />
                      </div>
                      <span style={{ color: isRisk ? theme.danger : theme.accentStrong, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCompactCurrency(gap)}</span>
                    </div>
                  );
                })}
                {!afpTrendRows.length && <div style={{ color: theme.subtext }}>No approval gap information matches the current filters.</div>}
              </div>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Top Commercial Issues</h3>
              <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
                {commercialRiskRows.map((row, index) => (
                  <div key={row.costCenter} style={{ border: `1px solid ${theme.border}`, borderLeft: `4px solid ${row.approved <= 0 ? theme.danger : theme.accentWarm}`, borderRadius: 8, padding: 10, background: theme.panelBg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong style={{ color: theme.text, fontSize: 13 }}>{index + 1}. {row.costCenter}</strong>
                      <span style={{ color: row.approvalRate >= 0.85 ? theme.accentStrong : row.approvalRate >= 0.6 ? theme.accentWarm : theme.danger, fontSize: 11, fontWeight: 900 }}>{formatPercent(row.approvalRate)}</span>
                    </div>
                    <div style={{ marginTop: 5, color: row.approved <= 0 ? theme.danger : theme.subtext, fontSize: 12 }}>
                      {row.approved <= 0 ? "No approved revenue" : `${formatCompactCurrency(row.gap)} pending approval`}
                    </div>
                  </div>
                ))}
                {!commercialRiskRows.length && <div style={{ color: theme.subtext }}>No commercial issues found for the current filters.</div>}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, 0.75fr)", gap: 12 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Cost Center Approval Risk</h3>
              <p style={{ margin: "5px 0 14px", color: theme.subtext, fontSize: 12 }}>Grouped view of largest pending approval exposure.</p>
              <div style={{ display: "grid", gap: 10 }}>
                {worstApprovalRows.slice(0, 8).map((row, index) => {
                  const width = `${Math.max(4, (Math.abs(row.gap) / (Math.abs(worstApprovalRows[0]?.gap) || 1)) * 100)}%`;
                  const accent = row.approvalRate >= 0.85 ? theme.accentStrong : row.approvalRate >= 0.6 ? theme.accentWarm : theme.danger;
                  return (
                    <div key={row.costCenter} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 0.65fr) minmax(160px, 1fr) 130px", gap: 12, alignItems: "center", border: `1px solid ${theme.border}`, borderRadius: 11, padding: "10px 12px", background: theme.panelBg }}>
                      <div>
                        <strong style={{ color: theme.text }}>{index + 1}. {row.costCenter}</strong>
                        <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{row.hub} | {formatPercent(row.approvalRate)} approved</div>
                      </div>
                      <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                      </div>
                      <div style={{ color: row.gap > 0 ? theme.danger : theme.accentStrong, fontWeight: 950, textAlign: "right" }}>{formatCompactCurrency(row.gap)}</div>
                    </div>
                  );
                })}
                {!worstApprovalRows.length && <div style={{ color: theme.subtext }}>No AFP performance matches the current filters.</div>}
              </div>
              <details style={{ marginTop: 14, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: "hidden", background: theme.panelBg }}>
                <summary style={{ padding: "12px 14px", cursor: "pointer", listStyle: "none", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>Open detailed approval table</summary>
                <div style={{ overflowX: "auto", padding: 12 }}>
                <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={leftHeaderStyle}>Cost Center</th>
                      <th style={tableHeaderStyle}>Submitted</th>
                      <th style={tableHeaderStyle}>Approved</th>
                      <th style={tableHeaderStyle}>Gap</th>
                      <th style={tableHeaderStyle}>Approval Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstApprovalRows.slice(0, 10).map((row) => (
                      <tr key={row.costCenter}>
                        <td style={leftCellStyle}>{row.costCenter}</td>
                        <td style={tableCellStyle}>{formatCompactCurrency(row.submitted)}</td>
                        <td style={tableCellStyle}>{formatCompactCurrency(row.approved)}</td>
                        <td style={{ ...tableCellStyle, color: row.gap > 0 ? theme.danger : theme.accentStrong, fontWeight: 900 }}>{formatCompactCurrency(row.gap)}</td>
                        <td style={{ ...tableCellStyle, color: row.approvalRate >= 0.85 ? theme.accentStrong : row.approvalRate >= 0.6 ? theme.accentWarm : theme.danger, fontWeight: 900 }}>{formatPercent(row.approvalRate)}</td>
                      </tr>
                    ))}
                    {!worstApprovalRows.length && (
                      <tr>
                        <td colSpan={5} style={{ ...leftCellStyle, color: theme.subtext }}>No AFP performance matches the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </details>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Approval Distribution</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {approvalDistributionRows.map((row) => (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 5 }}>
                      <span style={{ color: row.color, fontSize: 13, fontWeight: 950 }}>{row.label}</span>
                      <span style={{ color: theme.subtext, fontSize: 12 }}>{row.count} centers | {row.range}</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (row.count / maxApprovalDistribution) * 100)}%`, height: "100%", borderRadius: 999, background: row.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === "profitability" && (
        <div className="profitability-report-page" style={{ ...panelStyle, padding: 0, overflow: "hidden", background: themeMode === "light" ? "#ffffff" : theme.panelBg, borderRadius: 10 }}>
          <div className="profitability-report-header" style={{ background: "linear-gradient(135deg, #05295a 0%, #07366f 54%, #06254f 100%)", color: "#fff", padding: "28px 30px 22px", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 32, lineHeight: 1.05, fontWeight: 950, letterSpacing: 0 }}>P&amp;L REPORT - {profitabilityScopeType.toUpperCase()} VIEW</h2>
              <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,0.88)", fontSize: 15 }}>{profitabilityScopeName} performance overview</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 13, fontWeight: 850 }}>IGCC | Commercial Dashboard</span>
              <span style={{ display: "grid", placeItems: "center", width: 28, height: 34, border: "1px solid rgba(255,255,255,0.55)", borderRadius: 5, color: "#fff", fontSize: 18, fontWeight: 900 }}>▤</span>
            </div>
          </div>

          <div className="profitability-report-content" style={{ padding: 18, display: "grid", gap: 18 }}>
            <div className="profitability-report-info" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 10px 26px rgba(15,23,42,0.06)", display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1.25fr) auto", gap: 18, alignItems: "center" }}>
              {[
                [profitabilityScopeType, profitabilityScopeName, "Selected scope", "▦", "#0f5fb8"],
                ["Period", profitabilityPeriodLabel, costViewLabel, "▣", "#0f5fb8"],
              ].map(([label, value, detail, icon, color]) => (
                <div key={label} style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 8, background: `${color}12`, color, fontSize: 22, fontWeight: 950 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: theme.subtext, fontSize: 12, fontWeight: 900 }}>{label}</div>
                    <div style={{ color: theme.text, fontSize: 19, fontWeight: 950, overflowWrap: "anywhere" }}>{value}</div>
                    <div style={{ color: theme.subtext, fontSize: 12 }}>{detail}</div>
                  </div>
                </div>
              ))}
              <div className="profitability-print-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 238 }}>{renderCostViewToggle()}</div>
                <button type="button" onClick={() => window.print()} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.panelBg, color: "#0f5fb8", padding: "12px 16px", cursor: "pointer", fontWeight: 900, boxShadow: "0 8px 18px rgba(15,23,42,0.08)" }}>
                  ⇩ Export Report
                </button>
              </div>
            </div>

            <div className="profitability-kpi-grid" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                ["Approved AFP", approvedRevenue, "#16a34a", "AA"],
                ["Submitted AFP", submittedRevenue, "#0f5fb8", "SA"],
                ["Direct Cost", profitabilityDirectCost, "#f97316", "DC"],
                ["Gross Profit", profitabilityGrossBeforeCn, profitColor(profitabilityGrossBeforeCn), "GR"],
                ["Net Profit", profitabilityNetProfit, profitColor(profitabilityNetProfit), "NP"],
                ["Profit Margin", profitabilityMargin, profitColor(profitabilityNetProfit), "%"],
              ].map(([label, value, color, icon]) => (
                <div key={label} className="profitability-kpi-card executive-hover-card" style={{ borderRight: `1px solid ${theme.border}`, padding: "8px 14px", minHeight: 96, transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", background: color, color: "#fff", fontSize: 12, fontWeight: 950, boxShadow: `0 10px 20px ${color}28` }}>{icon}</span>
                    <div>
                      <div style={{ color: theme.text, fontSize: 12, fontWeight: 950, lineHeight: 1.25 }}>{label}</div>
                      <div style={{ marginTop: 8, color: theme.text, fontSize: 22, lineHeight: 1.05, fontWeight: 950, whiteSpace: "nowrap" }}>{label === "Profit Margin" ? formatPercent(value) : formatCompactCurrency(value)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="profitability-report-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 16 }}>
              <section className="profitability-report-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>1. Revenue Status (Approved vs Submitted)</h3>
                <div style={{ display: "grid", gap: 18, marginTop: 28 }}>
                  {[
                    ["Submitted AFP", submittedRevenue, "#0f5fb8"],
                    ["Approved AFP", approvedRevenue, "#16a34a"],
                    ["Gap Pending Approval", profitabilityApprovalGap, "#f59e0b"],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 92px", gap: 12, alignItems: "center" }}>
                      <span style={{ color: theme.text, fontSize: 13, fontWeight: 800 }}>{label}</span>
                      <div style={{ height: 24, background: theme.accentSoft, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(value ? 4 : 0, Math.min(100, (Math.abs(value) / profitabilityRevenueMax) * 100))}%`, height: "100%", background: color, boxShadow: `0 8px 18px ${color}33` }} />
                      </div>
                      <strong style={{ color: theme.text, textAlign: "right", fontSize: 16 }}>{formatCompactCurrency(value)}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24, border: `1px solid ${theme.border}`, borderRadius: 9, padding: 13, background: themeMode === "light" ? "#eff6ff" : theme.panelBg, color: "#003087", fontSize: 13, lineHeight: 1.45 }}>
                  <strong>Insight:</strong> {profitabilityApprovalGap > 0 ? `${formatCompactCurrency(profitabilityApprovalGap)} is still pending approval and should be followed up.` : "Submitted AFP is aligned with approved AFP for the selected scope."}
                </div>
              </section>

              <section className="profitability-report-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>2. Cost Breakdown by GL</h3>
                <div style={{ marginTop: 16, overflow: "hidden", border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) 120px 72px", background: "linear-gradient(135deg, #063366, #05295a)", color: "#fff", fontSize: 13, fontWeight: 950 }}>
                    <div style={{ padding: "11px 14px" }}>GL Category</div>
                    <div style={{ padding: "11px 14px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.25)" }}>Value ($)</div>
                    <div style={{ padding: "11px 14px", textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.25)" }}>%</div>
                  </div>
                  {profitabilityTopGlRows.map((row) => {
                    const share = profitabilityDirectCost ? row.amount / profitabilityDirectCost : 0;
                    return (
                      <div key={row.glName} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) 120px 72px", borderTop: `1px solid ${theme.border}`, background: themeMode === "light" ? "#ffffff" : theme.panelBg, color: theme.text, fontSize: 13 }}>
                        <div style={{ padding: "10px 14px", overflowWrap: "anywhere" }}>{row.glName}</div>
                        <div style={{ padding: "10px 14px", textAlign: "right", borderLeft: `1px solid ${theme.border}`, fontWeight: 850 }}>{formatCompactCurrency(row.amount)}</div>
                        <div style={{ padding: "10px 14px", textAlign: "center", borderLeft: `1px solid ${theme.border}`, fontWeight: 850 }}>{formatPercent(share)}</div>
                      </div>
                    );
                  })}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) 120px 72px", borderTop: `1px solid ${theme.border}`, background: themeMode === "light" ? "#e8f2ff" : theme.accentSoft, color: "#003087", fontSize: 13, fontWeight: 950 }}>
                    <div style={{ padding: "11px 14px" }}>Total Direct Cost</div>
                    <div style={{ padding: "11px 14px", textAlign: "right", borderLeft: `1px solid ${theme.border}` }}>{formatCompactCurrency(profitabilityDirectCost)}</div>
                    <div style={{ padding: "11px 14px", textAlign: "center", borderLeft: `1px solid ${theme.border}` }}>100%</div>
                  </div>
                </div>
                {!profitabilityTopGlRows.length && <div style={{ color: theme.subtext, marginTop: 12 }}>No GL cost data matches the selected scope.</div>}
                <div style={{ marginTop: 12, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 11, background: themeMode === "light" ? "#eff6ff" : theme.panelBg, color: "#003087", fontSize: 13, lineHeight: 1.4 }}>
                  <strong>Insight:</strong> {profitabilityTopDriver ? `${profitabilityTopDriver.glName} is the main cost driver at ${formatPercent(profitabilityDirectCost ? profitabilityTopDriver.amount / profitabilityDirectCost : 0)}.` : "No cost driver available for this scope."}
                </div>
              </section>
            </div>

            <div className="profitability-report-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 16 }}>
              <section className="profitability-report-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>3. Cost Distribution</h3>
                <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 24, alignItems: "center", marginTop: 22 }}>
                  <div style={{ width: 170, height: 170, borderRadius: "50%", background: `conic-gradient(${profitabilityDistributionStops}, #e2e8f0 ${Math.min(100, profitabilityDistributionCursor)}% 100%)`, position: "relative", boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.08)" }}>
                    <div style={{ position: "absolute", inset: 46, borderRadius: "50%", background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.08)" }} />
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {profitabilityDistributionRows.map((row) => (
                      <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <span style={{ display: "flex", gap: 9, alignItems: "center", color: theme.text, fontSize: 13, fontWeight: 800 }}>
                          <i style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, display: "inline-block" }} />
                          {row.label}
                        </span>
                        <strong style={{ color: theme.text }}>{formatPercent(profitabilityDirectCost ? row.amount / profitabilityDirectCost : 0)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="profitability-report-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>4. Credit Notes Impact</h3>
                <div style={{ marginTop: 16, overflow: "hidden", border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px minmax(130px, 0.8fr)", background: "linear-gradient(135deg, #063366, #05295a)", color: "#fff", fontSize: 13, fontWeight: 950 }}>
                    <div style={{ padding: "11px 14px" }}>Source</div>
                    <div style={{ padding: "11px 14px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.25)" }}>Value ($)</div>
                    <div style={{ padding: "11px 14px", textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.25)" }}>Impact</div>
                  </div>
                  {profitabilityCnRows.map((row) => {
                    const color = row.net >= 0 ? "#047857" : theme.danger;
                    return (
                      <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px minmax(130px, 0.8fr)", borderTop: `1px solid ${theme.border}`, background: themeMode === "light" ? "#ffffff" : theme.panelBg, color: theme.text, fontSize: 13 }}>
                        <div style={{ padding: "10px 14px" }}>{row.label} CN</div>
                        <div style={{ padding: "10px 14px", textAlign: "right", borderLeft: `1px solid ${theme.border}`, fontWeight: 850, color }}>{formatCompactCurrency(row.net)}</div>
                        <div style={{ padding: "10px 14px", textAlign: "center", borderLeft: `1px solid ${theme.border}`, color: "#047857", fontWeight: 850 }}>{row.impact}</div>
                      </div>
                    );
                  })}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px minmax(130px, 0.8fr)", borderTop: `1px solid ${theme.border}`, background: themeMode === "light" ? "#e8f2ff" : theme.accentSoft, color: "#003087", fontSize: 13, fontWeight: 950 }}>
                    <div style={{ padding: "11px 14px" }}>Total CN Impact</div>
                    <div style={{ padding: "11px 14px", textAlign: "right", borderLeft: `1px solid ${theme.border}`, color: profitabilityCnImpactTotal >= 0 ? "#047857" : theme.danger }}>{formatCompactCurrency(profitabilityCnImpactTotal)}</div>
                    <div style={{ padding: "11px 14px", textAlign: "center", borderLeft: `1px solid ${theme.border}` }}>{isAdjustedCostActive ? "Included" : "Tracked separately"}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 11, background: themeMode === "light" ? "#eff6ff" : theme.panelBg, color: "#003087", fontSize: 13, lineHeight: 1.4 }}>
                  <strong>Insight:</strong> CNs are shown as internal reallocations and must stay separate from operating cost.
                </div>
              </section>
            </div>

            <div className="profitability-report-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 16 }}>
              <section className="profitability-report-card profitability-report-card-keep" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>5. Profitability Movement</h3>
                <div style={{ position: "relative", height: 240, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, alignItems: "end", padding: "24px 10px 0" }}>
                  <div style={{ position: "absolute", left: "22%", right: "22%", top: 102, borderTop: `2px dashed ${theme.border}`, pointerEvents: "none" }} />
                  {profitabilityMovementRows.map((row, index) => {
                    const barHeight = Math.max(18, (Math.abs(row.value) / profitabilityMovementMax) * 150);
                    return (
                      <div key={row.label} style={{ display: "grid", justifyItems: "center", gap: 8, zIndex: 1 }}>
                        <strong style={{ color: theme.text, fontSize: 15 }}>{index === 1 && row.value > 0 ? "+" : ""}{formatCompactCurrency(row.value)}</strong>
                        <div style={{ width: "58%", height: barHeight, borderRadius: "4px 4px 0 0", background: `linear-gradient(135deg, ${row.color}, ${row.color}dd)`, boxShadow: `0 12px 22px ${row.color}30` }} />
                        <span style={{ color: theme.text, fontSize: 12, fontWeight: 850, textAlign: "center", lineHeight: 1.2 }}>{row.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="profitability-report-card profitability-report-card-keep" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
                <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>6. Executive Insights</h3>
                <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                  {profitabilityDashboardInsights.map((item, index) => (
                    <div key={item.label} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, color: "#fff", background: item.color, fontSize: 12, fontWeight: 950 }}>{index + 1}</span>
                      <div>
                        <strong style={{ color: theme.text, fontSize: 13 }}>{item.label}</strong>
                        <p style={{ margin: "4px 0 0", color: theme.subtext, fontSize: 13, lineHeight: 1.45 }}>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="profitability-report-card profitability-actions-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, background: themeMode === "light" ? "#ffffff" : theme.inputBg, boxShadow: "0 12px 30px rgba(15,23,42,0.07)" }}>
              <h3 style={{ margin: 0, color: "#003087", fontSize: 16, fontWeight: 950 }}>7. Strategic Actions</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginTop: 18 }}>
                {profitabilityStrategicActions.map(([title, detail, color, icon]) => (
                  <div key={title} className="executive-hover-card" style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16, background: theme.panelBg, minHeight: 126, transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                    <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", border: `2px solid ${color}`, color, fontSize: 12, fontWeight: 950 }}>{icon}</span>
                      <div>
                        <strong style={{ color: theme.text, fontSize: 14 }}>{title}</strong>
                        <p style={{ margin: "12px 0 0", color: theme.subtext, fontSize: 13, lineHeight: 1.45 }}>{detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="profitability-print-exact">
            <div className="print-exact-header">
              <div>
                <h1>P&amp;L REPORT - {profitabilityScopeType.toUpperCase()} VIEW</h1>
                <p>{profitabilityScopeType === "Cost Center" ? "Single Cost Center" : profitabilityScopeType} Performance Overview</p>
              </div>
              <div className="print-exact-brand">IGCC | Commercial Dashboard <span>▤</span></div>
            </div>

            <div className="print-exact-meta">
              <div className="print-exact-meta-item">
                <span className="print-exact-icon">CC</span>
                <div>
                  <small>{profitabilityScopeType}</small>
                  <strong>{profitabilityScopeName}</strong>
                </div>
              </div>
              <div className="print-exact-meta-item">
                <span className="print-exact-icon">MO</span>
                <div>
                  <small>Period</small>
                  <strong>{profitabilityPeriodLabel}</strong>
                </div>
              </div>
              <button type="button">Export Report</button>
            </div>

            <div className="print-exact-kpis">
              {[
                ["$", "Total Revenue (Approved)", approvedRevenue, "#22a852"],
                ["SA", "Total Revenue (Submitted)", submittedRevenue, "#1267bf"],
                ["DC", "Direct Cost", profitabilityDirectCost, "#f28a16"],
                ["GP", "Gross Profit", profitabilityGrossBeforeCn, "#33a852"],
                ["NP", "Net Profit", profitabilityNetProfit, "#8b5cf6"],
                ["%", "Profit Margin", profitabilityMargin, "#18a6aa"],
              ].map(([icon, label, value, color]) => (
                <div className="print-exact-kpi" key={label}>
                  <span style={{ background: color }}>{icon}</span>
                  <div>
                    <small>{label}</small>
                    <strong>{label === "Profit Margin" ? formatPercent(value) : formatCompactCurrency(value)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="print-exact-grid">
              <section className="print-exact-card">
                <h2>1. Revenue Status (Approved vs Submitted)</h2>
                <div className="print-exact-bars">
                  {[
                    ["Submitted AFP", submittedRevenue, "#1267bf"],
                    ["Approved AFP", approvedRevenue, "#22a852"],
                    ["Gap (Pending Approval)", profitabilityApprovalGap, "#f28a16"],
                  ].map(([label, value, color]) => (
                    <div className="print-exact-bar-row" key={label}>
                      <label>{label}</label>
                      <div><i style={{ width: `${Math.max(value ? 7 : 0, Math.min(100, (Math.abs(value) / profitabilityRevenueMax) * 100))}%`, background: color }} /></div>
                      <strong>{formatCompactCurrency(value)}</strong>
                    </div>
                  ))}
                </div>
                <p className="print-exact-insight">i&nbsp;&nbsp;<b>INSIGHT:</b> {profitabilityApprovalGap > 0 ? "Delay in approval creates cash flow pressure." : "AFP is fully approved for this selection."}</p>
              </section>

              <section className="print-exact-card">
                <h2>2. Cost Breakdown by GL (This Selection Only)</h2>
                <div className="print-exact-table">
                  <div className="thead"><span>GL Category</span><span>Value ($)</span><span>%</span></div>
                  {profitabilityTopGlRows.map((row) => (
                    <div className="tr" key={row.glName}>
                      <span>{row.glName}</span>
                      <span>{formatCompactCurrency(row.amount)}</span>
                      <span>{formatPercent(profitabilityDirectCost ? row.amount / profitabilityDirectCost : 0)}</span>
                    </div>
                  ))}
                  <div className="tr total"><span>Total Direct Cost</span><span>{formatCompactCurrency(profitabilityDirectCost)}</span><span>100%</span></div>
                </div>
                <p className="print-exact-insight">i&nbsp;&nbsp;<b>INSIGHT:</b> {profitabilityTopDriver ? `${profitabilityTopDriver.glName} is the largest cost driver.` : "No cost driver available."}</p>
              </section>

              <section className="print-exact-card">
                <h2>3. Cost Distribution (Visual)</h2>
                <div className="print-exact-donut-wrap">
                  <div className="print-exact-donut" style={{ background: `conic-gradient(${profitabilityDistributionStops}, #e2e8f0 ${Math.min(100, profitabilityDistributionCursor)}% 100%)` }}><i /></div>
                  <div className="print-exact-legend">
                    {profitabilityDistributionRows.map((row) => (
                      <div key={row.key}><span><i style={{ background: row.color }} />{row.label}</span><b>{formatPercent(profitabilityDirectCost ? row.amount / profitabilityDirectCost : 0)}</b></div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="print-exact-card">
                <h2>4. Credit Notes (CN Impact - This Selection Only)</h2>
                <div className="print-exact-table">
                  <div className="thead"><span>Source</span><span>Value ($)</span><span>Impact</span></div>
                  {profitabilityCnRows.map((row) => (
                    <div className="tr" key={row.key}><span>{row.label} CN</span><span>{formatCompactCurrency(row.net)}</span><span>{row.impact}</span></div>
                  ))}
                  <div className="tr total"><span>Total CN Impact</span><span>{formatCompactCurrency(profitabilityCnImpactTotal)}</span><span>{isAdjustedCostActive ? "Included" : "Tracked"}</span></div>
                </div>
                <p className="print-exact-insight">i&nbsp;&nbsp;<b>INSIGHT:</b> CNs should be tracked separately from operational cost.</p>
              </section>

              <section className="print-exact-card">
                <h2>5. Profitability Movement</h2>
                <div className="print-exact-waterfall">
                  {profitabilityMovementRows.map((row, index) => (
                    <div key={row.label}>
                      <b>{index === 1 && row.value > 0 ? "+" : ""}{formatCompactCurrency(row.value)}</b>
                      <i style={{ height: `${Math.max(15, (Math.abs(row.value) / profitabilityMovementMax) * 68)}px`, background: row.color }} />
                      <span>{row.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="print-exact-card">
                <h2>6. Executive Insights (Auto-Generated)</h2>
                <div className="print-exact-insights">
                  {profitabilityDashboardInsights.map((item, index) => (
                    <p key={item.label}><span style={{ color: item.color }}>{index + 1}</span>{item.detail}</p>
                  ))}
                </div>
              </section>
            </div>

            <section className="print-exact-card print-exact-actions">
              <h2>7. Strategic Actions</h2>
              <div>
                {profitabilityStrategicActions.map(([title, detail, color, icon]) => (
                  <article key={title}>
                    <span style={{ color, borderColor: color }}>{icon}</span>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {activePage === "profitability-legacy" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 24, letterSpacing: 0 }}>Cost Center Profitability</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Executive profitability analysis by revenue, cost, CN impact, and cost drivers.</p>
            </div>
            <div style={{ minWidth: 320 }}>{renderCostViewToggle()}</div>
          </div>

          {renderExecutiveInsights("Executive Profit Summary", profitSummaryInsights)}
          {filters.costCenter ? (
            renderCostCenterProfitabilityDetail()
          ) : (
            <>
              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Profitability Explorer</h3>
                    <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Cost centers ranked by approved profit position.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 12, background: theme.accentSoft, border: `1px solid ${theme.border}`, flexWrap: "wrap" }}>
                      {profitabilitySortOptions.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setProfitabilitySortMode(value)}
                          style={{ border: "none", borderRadius: 9, padding: "8px 10px", cursor: "pointer", background: profitabilitySortMode === value ? theme.panelBg : "transparent", color: profitabilitySortMode === value ? theme.accentStrong : theme.text, boxShadow: profitabilitySortMode === value ? "0 4px 14px rgba(15,23,42,0.10)" : "none", fontSize: 11, fontWeight: 950 }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span style={{ color: theme.subtext, fontSize: 12, fontWeight: 900 }}>{profitabilityFocusRows.length} centers shown</span>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {profitabilityFocusRows.map((row, index) => {
                    const width = `${Math.max(4, (Math.abs(row.approvedNet) / (maxProfitabilityExposure || 1)) * 100)}%`;
                    const accent = profitColor(row.approvedNet);
                    return (
                      <div key={row.costCenter} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.75fr) minmax(160px, 1fr) 140px", gap: 12, alignItems: "center", border: `1px solid ${theme.border}`, borderRadius: 12, padding: "12px 14px", background: theme.panelBg }}>
                        <div>
                          <strong style={{ color: theme.text }}>{index + 1}. {row.costCenter}</strong>
                          <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{row.portfolio} | {row.hub}</div>
                        </div>
                        <div style={{ height: 13, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                          <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: accent, fontWeight: 950 }}>{formatCompactCurrency(row.approvedNet)}</div>
                          <div style={{ marginTop: 4, color: theme.subtext, fontSize: 12 }}>{formatPercent(row.approvedMargin)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {!profitabilityFocusRows.length && <div style={{ color: theme.subtext }}>No profitability data matches the current filters.</div>}
                </div>
              </div>
            </>
          )}

          {!filters.costCenter && <details style={{ border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden", background: theme.panelBg }}>
            <summary style={{ padding: "14px 16px", cursor: "pointer", listStyle: "none", color: theme.text, fontWeight: 950, background: theme.accentSoft }}>Open full Profit &amp; Loss drilldown</summary>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", background: theme.panelBg }}>
              <thead>
                <tr>
                  <th style={{ ...leftHeaderStyle, width: "36%" }}>Level</th>
                  {periodView === "monthly" ? (
                    <>
                      <th style={tableHeaderStyle}>Cost</th>
                      <th style={tableHeaderStyle}>Submitted AFP</th>
                      <th style={tableHeaderStyle}>Approved AFP</th>
                      <th style={tableHeaderStyle}>Profit</th>
                      <th style={tableHeaderStyle}>Margin %</th>
                    </>
                  ) : (
                    profitTimeColumns.map((period) => (
                      <th key={period.key} style={tableHeaderStyle}>{period.label}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {hasActiveGlobalFilter && portfolioPerformanceRows.map((portfolio) => {
                  const portfolioKey = `portfolio:${portfolio.label}`;
                  const portfolioOpen = isProfitRowExpanded(portfolioKey);
                  const portfolioHubs = hubPerformanceSummaryRows.filter((hub) => hub.portfolio === portfolio.label);
                  const portfolioCenters = portfolioHubs.flatMap((hub) => COST_CENTER_GROUPS.find((group) => group.label === hub.hub)?.centers ?? []);
                  const portfolioRows = getRowsForCenters(portfolioCenters);

                  return (
                    <Fragment key={portfolioKey}>
                      <tr style={{ background: theme.inputBg }}>
                        <td style={{ ...leftCellStyle, fontWeight: 950 }}>
                          <button type="button" onClick={() => toggleProfitRow(portfolioKey)} style={{ width: 28, height: 28, marginRight: 10, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.panelBg, color: theme.text, cursor: "pointer", fontWeight: 950 }}>
                            {portfolioOpen ? "-" : "+"}
                          </button>
                          <span style={{ color: portfolio.accent }}>{portfolio.label}</span>
                        </td>
                        {periodView === "monthly" ? (
                          <>
                            <td style={tableCellStyle}>{formatCurrency(portfolio.cost)}</td>
                            <td style={tableCellStyle}>{formatCurrency(portfolio.submitted)}</td>
                            <td style={tableCellStyle}>{formatCurrency(portfolio.approved)}</td>
                            <td style={{ ...tableCellStyle, color: profitColor(portfolio.net), fontWeight: 900 }}>{formatCurrency(portfolio.net)}</td>
                            <td style={{ ...tableCellStyle, color: profitColor(portfolio.net), fontWeight: 900 }}>{formatPercent(portfolio.margin)}</td>
                          </>
                        ) : (
                          profitTimeColumns.map((period) => (
                            <td key={period.key} style={tableCellStyle}>{renderProfitPeriodCell(portfolioRows.costRows, portfolioRows.revenueRows, period)}</td>
                          ))
                        )}
                      </tr>

                      {portfolioOpen && portfolioHubs.map((hub) => {
                        const hubKey = `${portfolioKey}:hub:${hub.hub}`;
                        const hubOpen = isProfitRowExpanded(hubKey);
                        const hubCenters = profitabilityRows.filter((center) => center.hub === hub.hub);
                        const hubSourceCenters = COST_CENTER_GROUPS.find((group) => group.label === hub.hub)?.centers ?? [];
                        const hubRowsForPeriods = getRowsForCenters(hubSourceCenters);

                        return (
                          <Fragment key={hubKey}>
                            <tr>
                              <td style={{ ...leftCellStyle, paddingLeft: 34 }}>
                                <button type="button" onClick={() => toggleProfitRow(hubKey)} style={{ width: 26, height: 26, marginRight: 10, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.inputBg, color: theme.text, cursor: "pointer", fontWeight: 950 }}>
                                  {hubOpen ? "-" : "+"}
                                </button>
                                {hub.hub}
                              </td>
                              {periodView === "monthly" ? (
                                <>
                                  <td style={tableCellStyle}>{formatCurrency(hub.cost)}</td>
                                  <td style={tableCellStyle}>{formatCurrency(hub.submitted)}</td>
                                  <td style={tableCellStyle}>{formatCurrency(hub.approved)}</td>
                                  <td style={{ ...tableCellStyle, color: profitColor(hub.net), fontWeight: 900 }}>{formatCurrency(hub.net)}</td>
                                  <td style={{ ...tableCellStyle, color: profitColor(hub.net), fontWeight: 900 }}>{formatPercent(hub.margin)}</td>
                                </>
                              ) : (
                                profitTimeColumns.map((period) => (
                                  <td key={period.key} style={tableCellStyle}>{renderProfitPeriodCell(hubRowsForPeriods.costRows, hubRowsForPeriods.revenueRows, period)}</td>
                                ))
                              )}
                            </tr>

                            {hubOpen && hubCenters.map((center) => {
                              const centerKey = `${hubKey}:center:${center.costCenter}`;
                              const centerOpen = isProfitRowExpanded(centerKey);
                              const periodRows = getGlobalPeriodRowsForCenter(center.costCenter);
                              const centerRowsForPeriods = getRowsForCenters([center.costCenter]);
                              const centerBreakdownRows = getCostBreakdownRows(centerRowsForPeriods.costRows);

                              return (
                                <Fragment key={centerKey}>
                                  <tr style={{ background: themeMode === "light" ? "#fbfdff" : theme.inputBg }}>
                                    <td style={{ ...leftCellStyle, paddingLeft: 68 }}>
                                      <button type="button" onClick={() => toggleProfitRow(centerKey)} style={{ width: 24, height: 24, marginRight: 10, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.panelBg, color: theme.text, cursor: "pointer", fontWeight: 950 }}>
                                        {centerOpen ? "-" : "+"}
                                      </button>
                                      {center.costCenter}
                                    </td>
                                    {periodView === "monthly" ? (
                                      <>
                                        <td style={tableCellStyle}>{formatCurrency(center.cost)}</td>
                                        <td style={tableCellStyle}>{formatCurrency(center.submitted)}</td>
                                        <td style={tableCellStyle}>{formatCurrency(center.approved)}</td>
                                        <td style={{ ...tableCellStyle, color: profitColor(center.approvedNet), fontWeight: 900 }}>{formatCurrency(center.approvedNet)}</td>
                                        <td style={{ ...tableCellStyle, color: profitColor(center.approvedNet), fontWeight: 900 }}>{formatPercent(center.approvedMargin)}</td>
                                      </>
                                    ) : (
                                      profitTimeColumns.map((period) => (
                                        <td key={period.key} style={tableCellStyle}>{renderProfitPeriodCell(centerRowsForPeriods.costRows, centerRowsForPeriods.revenueRows, period)}</td>
                                      ))
                                    )}
                                  </tr>

                                  {centerOpen && periodView === "monthly" && periodRows.map((period) => {
                                    const periodKey = `${centerKey}:period:${period.key}`;
                                    const periodOpen = isProfitRowExpanded(periodKey);
                                    const breakdownRows = getCostBreakdownRows(period.costRows);

                                    return (
                                      <Fragment key={periodKey}>
                                        <tr>
                                          <td style={{ ...leftCellStyle, paddingLeft: 102, color: theme.subtext }}>
                                            <button type="button" onClick={() => toggleProfitRow(periodKey)} disabled={!breakdownRows.length} style={{ width: 22, height: 22, marginRight: 10, border: `1px solid ${theme.border}`, borderRadius: 6, background: breakdownRows.length ? theme.inputBg : "transparent", color: theme.text, cursor: breakdownRows.length ? "pointer" : "default", fontWeight: 950 }}>
                                              {breakdownRows.length ? (periodOpen ? "-" : "+") : ""}
                                            </button>
                                            {period.label}
                                          </td>
                                          <td style={tableCellStyle}>{formatCurrency(period.cost)}</td>
                                          <td style={tableCellStyle}>{formatCurrency(period.submitted)}</td>
                                          <td style={tableCellStyle}>{formatCurrency(period.approved)}</td>
                                          <td style={{ ...tableCellStyle, color: profitColor(period.profit), fontWeight: 900 }}>{formatCurrency(period.profit)}</td>
                                          <td style={{ ...tableCellStyle, color: profitColor(period.profit), fontWeight: 900 }}>{formatPercent(period.margin)}</td>
                                        </tr>

                                        {periodOpen && breakdownRows.map((breakdown) => (
                                          <tr key={`${periodKey}:breakdown:${breakdown.label}`} style={{ background: theme.accentSoft }}>
                                            <td style={{ ...leftCellStyle, paddingLeft: 140, color: theme.text }}>
                                              {breakdown.label}
                                              <span style={{ marginLeft: 8, color: theme.subtext, fontSize: 12, fontWeight: 700 }}>GL name | {breakdown.rows} entries</span>
                                            </td>
                                            <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatCurrency(breakdown.cost)}</td>
                                            <td style={{ ...tableCellStyle, color: theme.subtext }}>-</td>
                                            <td style={{ ...tableCellStyle, color: theme.subtext }}>-</td>
                                            <td style={{ ...tableCellStyle, color: theme.subtext }}>-</td>
                                            <td style={{ ...tableCellStyle, color: theme.subtext }}>-</td>
                                          </tr>
                                        ))}
                                      </Fragment>
                                    );
                                  })}
                                  {centerOpen && periodView !== "monthly" && centerBreakdownRows.map((breakdown) => (
                                    <tr key={`${centerKey}:breakdown:${breakdown.label}`} style={{ background: theme.accentSoft }}>
                                      <td style={{ ...leftCellStyle, paddingLeft: 102, color: theme.text }}>
                                        {breakdown.label}
                                        <span style={{ marginLeft: 8, color: theme.subtext, fontSize: 12, fontWeight: 700 }}>GL name | {breakdown.rows} entries</span>
                                      </td>
                                      {profitTimeColumns.map((period) => {
                                        const periodCost = centerRowsForPeriods.costRows
                                          .filter((item) => (item.category || "Uncategorized") === breakdown.label && getPeriodBucket(item, periodView).key === period.key)
                                          .reduce((sum, item) => sum + item.amount, 0);

                                        return (
                                          <td key={period.key} style={{ ...tableCellStyle, fontWeight: 900 }}>{periodCost ? formatCurrency(periodCost) : "-"}</td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}

                {!hasActiveGlobalFilter && (
                  <tr>
                    <td colSpan={periodView === "monthly" ? 6 : profitTimeColumns.length + 1} style={{ ...leftCellStyle, color: theme.subtext }}>Choose at least one global filter to show Profit &amp; Loss performance.</td>
                  </tr>
                )}
                {hasActiveGlobalFilter && !portfolioPerformanceRows.length && (
                  <tr>
                    <td colSpan={periodView === "monthly" ? 6 : profitTimeColumns.length + 1} style={{ ...leftCellStyle, color: theme.subtext }}>No profit and loss performance matches the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </details>}
        </div>
      )}

      {activePage === "vendor" && (
        <div style={panelStyle}>
          <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Vendor Analysis</h2>
          <p style={{ margin: "5px 0 16px", color: theme.subtext, fontSize: 13 }}>Top vendors, concentration, and cost per vendor from the spent report.</p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 420px), 1fr) minmax(min(100%, 320px), 0.75fr)", gap: 14 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Top Vendors by Cost</h3>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {vendorRows.slice(0, 10).map((row) => (
                  <div key={row.vendor} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 1fr) minmax(0, 1fr) 120px", gap: 10, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850, overflowWrap: "anywhere" }}>{row.vendor}</span>
                    <div style={{ height: 11, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxVendorCost || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentStrong }} />
                    </div>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCurrency(row.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Vendor Concentration</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {[
                  ["Vendors", vendorRows.length.toLocaleString()],
                  ["Top Vendor Share", formatPercent(visibleTotal ? (vendorRows[0]?.cost ?? 0) / visibleTotal : 0)],
                  ["Top 5 Share", formatPercent(visibleTotal ? vendorRows.slice(0, 5).reduce((sum, row) => sum + row.cost, 0) / visibleTotal : 0)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 10 }}>
                    <span style={{ color: theme.subtext }}>{label}</span>
                    <strong style={{ color: theme.text }}>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePage === "performance" && (
        <>
          <details style={panelStyle}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14, cursor: "pointer", listStyle: "none" }}>
              <div>
                <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Performance Drilldown</h2>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Expand a portfolio, then expand a hub to view period and cost-center performance.</p>
              </div>
              {renderPeriodToggle()}
            </summary>
            <div style={{ display: "grid", gap: 12 }}>
              {performanceByPortfolio.map((section) => {
                const portfolioCost = section.hubRows.reduce((sum, row) => sum + row.cost, 0);
                const portfolioApproved = section.hubRows.reduce((sum, row) => sum + row.approved, 0);
                const portfolioSubmitted = section.hubRows.reduce((sum, row) => sum + row.submitted, 0);
                const portfolioRows = section.hubRows.reduce((sum, row) => sum + row.rows, 0);

                return (
                  <details key={section.label} style={{ border: `1px solid ${section.accent}`, borderRadius: 8, overflow: "hidden", background: theme.panelBg }}>
                    <summary style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px 150px 150px 120px", gap: 12, alignItems: "center", padding: 14, cursor: "pointer", background: section.soft, color: theme.text, fontWeight: 900 }}>
                      <span style={{ color: section.accent }}>{section.label}</span>
                      <span style={{ textAlign: "right" }}>Cost {formatCurrency(portfolioCost)}</span>
                      <span style={{ textAlign: "right" }}>Submitted {formatCurrency(portfolioSubmitted)}</span>
                      <span style={{ textAlign: "right" }}>Approved {formatCurrency(portfolioApproved)}</span>
                      <span style={{ textAlign: "right", color: theme.subtext }}>{portfolioRows} entries</span>
                    </summary>

                    <div style={{ display: "grid", gap: 10, padding: 12 }}>
                      {section.hubs.map((hubName) => {
                        const hubRows = section.hubRows.filter((row) => row.hub === hubName);
                        const hubCenterRows = section.centerRows.filter((row) => row.hub === hubName);
                        if (!hubRows.length && !hubCenterRows.length) return null;

                        const hubCost = hubRows.reduce((sum, row) => sum + row.cost, 0);
                        const hubApproved = hubRows.reduce((sum, row) => sum + row.approved, 0);
                        const hubSubmitted = hubRows.reduce((sum, row) => sum + row.submitted, 0);
                        const hubRowsCount = hubRows.reduce((sum, row) => sum + row.rows, 0);

                        return (
                          <details key={hubName} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden", background: theme.panelBg }}>
                            <summary style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px 140px 140px 90px", gap: 12, alignItems: "center", padding: 12, cursor: "pointer", background: theme.accentSoft, color: theme.text, fontWeight: 800 }}>
                              <span style={{ borderLeft: `4px solid ${section.accent}`, paddingLeft: 8 }}>{hubName}</span>
                              <span style={{ textAlign: "right" }}>{formatCurrency(hubCost)}</span>
                              <span style={{ textAlign: "right" }}>{formatCurrency(hubSubmitted)}</span>
                              <span style={{ textAlign: "right" }}>{formatCurrency(hubApproved)}</span>
                              <span style={{ textAlign: "right", color: theme.subtext }}>{hubRowsCount} entries</span>
                            </summary>

                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", minWidth: 1060, borderCollapse: "collapse" }}>
                                <thead>
                                  <tr>
                                    <th style={leftHeaderStyle}>Period</th>
                                    <th style={leftHeaderStyle}>Cost Center</th>
                                    <th style={tableHeaderStyle}>Cost</th>
                                    <th style={tableHeaderStyle}>Submitted Rev</th>
                                    <th style={tableHeaderStyle}>Approved Rev</th>
                                    <th style={tableHeaderStyle}>Profit / Loss</th>
                                    <th style={tableHeaderStyle}>Recovery</th>
                                    <th style={tableHeaderStyle}>Entries</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {hubCenterRows.map((row) => (
                                    <tr key={`${row.hub}-${row.center}-${row.period}`}>
                                      <td style={leftCellStyle}>{row.period}</td>
                                      <td style={leftCellStyle}>{row.center}</td>
                                      <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                                      <td style={tableCellStyle}>{formatCurrency(row.submitted)}</td>
                                      <td style={tableCellStyle}>{formatCurrency(row.approved)}</td>
                                      <td style={{ ...tableCellStyle, color: profitColor(row.profit), fontWeight: 800 }}>{formatCurrency(row.profit)}</td>
                                      <td style={tableCellStyle}>{formatPercent(row.recovery)}</td>
                                      <td style={{ ...tableCellStyle, color: theme.subtext }}>{row.rows}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        </>
      )}

      {activePage === "detail" && (
        <>
          <details style={panelStyle}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16, cursor: "pointer", listStyle: "none" }}>
              <div>
                <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Company Cost Details</h2>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Cost performance by period and hub, separated from commercial revenue performance.</p>
              </div>
              {renderPeriodToggle()}
            </summary>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 380px), 1fr) minmax(min(100%, 380px), 1fr)", gap: 14 }}>
              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Cost by Period</h3>
                  <strong style={{ color: theme.text }}>{formatCurrency(visibleTotal)}</strong>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {periodTotals.map((period) => {
                    const width = maxPeriodAmount ? `${Math.max(3, (Math.abs(period.amount) / maxPeriodAmount) * 100)}%` : "0%";
                    return (
                      <div key={period.key} style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr) 130px", gap: 10, alignItems: "center" }}>
                        <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{period.label}</span>
                        <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                          <div style={{ width, height: "100%", background: theme.accentStrong, borderRadius: 999 }} />
                        </div>
                        <span style={{ textAlign: "right", color: theme.text, fontSize: 12, fontWeight: 850 }}>{formatCurrency(period.amount)}</span>
                      </div>
                    );
                  })}
                  {!periodTotals.length && <div style={{ color: theme.subtext }}>No cost performance matches the current filters.</div>}
                </div>
              </div>

              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Cost by Hub</h3>
                  <span style={{ color: theme.subtext, fontSize: 13 }}>{hubHistogramRows.length} hubs</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {hubHistogramRows.map((hub) => {
                    const section = HUB_SECTIONS.find((item) => item.hubs.includes(hub.label));
                    const accent = section?.accent ?? theme.accentStrong;
                    const width = `${Math.max(3, (Math.abs(hub.amount) / (maxHubHistogramAmount || 1)) * 100)}%`;

                    return (
                      <div key={hub.label} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 130px", gap: 10, alignItems: "center" }}>
                        <span style={{ color: accent, fontSize: 12, fontWeight: 900 }}>{hub.label}</span>
                        <div style={{ height: 13, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                          <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                        </div>
                        <span style={{ textAlign: "right", color: theme.text, fontSize: 12, fontWeight: 850 }}>{formatCurrency(hub.amount)}</span>
                      </div>
                    );
                  })}
                  {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub cost performance matches the current filters.</div>}
                </div>
              </div>
            </div>
          </details>

          <details style={panelStyle}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16, cursor: "pointer", listStyle: "none" }}>
              <div>
                <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Cost Center Commercial Snapshot</h2>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Detailed spend categories and revenue performance for one normalized cost center.</p>
              </div>
              <select value={detailCostCenter} onClick={(event) => event.stopPropagation()} onChange={(event) => setDetailCostCenter(event.target.value)} style={{ minWidth: 240, padding: 11, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, fontWeight: 800 }}>
                {COST_CENTER_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.centers.map((center) => (
                      <option key={center} value={center}>{center}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </summary>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
              {[
                ["Cost Center", detailCostCenter, detailMergedSources.length > 1 ? `Merged: ${detailMergedSources.join(" + ")}` : "No aliases merged", theme.accentStrong],
                ["Approved Revenue", formatCurrency(detailApprovedRevenue), "Approved commercial value", "#059669"],
                ["Submitted Revenue", formatCurrency(detailSubmittedRevenue), "Submitted commercial value", "#2563eb"],
                ["Spent Cost", formatCurrency(detailCostTotal), "Commercial cost base", theme.accentWarm],
                ["Profit / Loss", formatCurrency(detailProfit), `${formatPercent(detailCostTotal ? detailApprovedRevenue / detailCostTotal : 0)} recovery`, profitColor(detailProfit)],
              ].map(([label, value, detail, accent]) => (
                <div key={label} style={{ border: `1px solid ${theme.border}`, borderTop: `4px solid ${accent}`, borderRadius: 8, padding: 15, background: theme.panelBg }}>
                  <div style={{ color: theme.subtext, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 8, color: theme.text, fontSize: 22, lineHeight: 1.05, fontWeight: 950, overflowWrap: "anywhere" }}>{value}</div>
                  <div style={{ marginTop: 8, color: theme.subtext, fontSize: 13, lineHeight: 1.35 }}>{detail}</div>
                </div>
              ))}
            </div>
          </details>

          <details style={panelStyle}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14, cursor: "pointer", listStyle: "none" }}>
              <div>
                <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Detailed Cost by GL Name</h2>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Every GL name for the selected cost center.</p>
              </div>
              <div style={{ color: theme.subtext, fontSize: 14 }}>GL cost view</div>
            </summary>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={leftHeaderStyle}>GL Name</th>
                    <th style={tableHeaderStyle}>Spent Cost</th>
                    <th style={tableHeaderStyle}>Share of Cost</th>
                    <th style={tableHeaderStyle}>Entries</th>
                    <th style={leftHeaderStyle}>Cost Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {detailGlRows.map((row) => {
                    const share = detailCostTotal ? row.amount / detailCostTotal : 0;
                    const width = detailMaxGlAmount ? `${Math.max(3, (Math.abs(row.amount) / detailMaxGlAmount) * 100)}%` : "0%";

                    return (
                      <tr key={row.glName}>
                        <td style={leftCellStyle}>{row.glName}</td>
                        <td style={tableCellStyle}>{formatCurrency(row.amount)}</td>
                        <td style={tableCellStyle}>{formatPercent(share)}</td>
                        <td style={{ ...tableCellStyle, color: theme.subtext }}>{row.rows}</td>
                        <td style={{ ...leftCellStyle, minWidth: 220 }}>
                          <div style={{ height: 9, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                            <div style={{ width, height: "100%", borderRadius: 999, background: theme.accentStrong }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!detailGlRows.length && (
                    <tr>
                      <td colSpan={5} style={{ ...leftCellStyle, color: theme.subtext }}>No GL name detail found for this cost center and current month filter.</td>
                    </tr>
                  )}
                  <tr style={{ background: theme.accentSoft }}>
                    <td style={leftCellStyle}>Total</td>
                    <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatCurrency(detailCostTotal)}</td>
                    <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatPercent(detailCostTotal ? 1 : 0)}</td>
                    <td style={{ ...tableCellStyle, color: theme.subtext, fontWeight: 900 }}>{detailFilteredCostRows.length}</td>
                    <td style={leftCellStyle}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {activePage === "statement" && (
        <details style={panelStyle}>
          <summary style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16, cursor: "pointer", listStyle: "none" }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Commercial Statement</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Commercial position by period: AFP pipeline, approved revenue, cost, recovery, and margin.</p>
            </div>
            {renderPeriodToggle()}
          </summary>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              ["Submitted AFP", formatCurrency(submittedRevenue), "Commercial pipeline", "#2563eb"],
              ["Approved AFP", formatCurrency(approvedRevenue), "Recognized commercial value", "#059669"],
              ["Cost Base", formatCurrency(visibleTotal), "Filtered spent cost", theme.accentWarm],
              ["Commercial Result", formatCurrency(revenueSurplus), "Approved less cost", profitColor(revenueSurplus)],
              ["Recovery", formatPercent(recoveryRatio), "Approved revenue / cost", theme.accentStrong],
            ].map(([label, value, detail, accent]) => (
              <div key={label} style={{ border: `1px solid ${theme.border}`, borderLeft: `5px solid ${accent}`, borderRadius: 8, padding: 14, background: theme.panelBg }}>
                <div style={{ color: theme.subtext, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                <div style={{ marginTop: 7, color: theme.text, fontSize: 22, fontWeight: 950, lineHeight: 1.05 }}>{value}</div>
                <div style={{ marginTop: 7, color: theme.subtext, fontSize: 12 }}>{detail}</div>
              </div>
            ))}
          </div>

          <details style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.panelBg, overflow: "hidden" }}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 14, cursor: "pointer", background: theme.accentSoft, color: theme.text, fontWeight: 900, listStyle: "none" }}>
              <span>Period Commercial Detail</span>
              <span style={{ color: theme.subtext, fontSize: 13 }}>{incomeStatementRows.length.toLocaleString()} periods</span>
            </summary>
          <div style={{ overflowX: "auto", padding: 12 }}>
            <table style={{ width: "100%", minWidth: 1060, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Period</th>
                  <th style={tableHeaderStyle}>Submitted AFP</th>
                  <th style={tableHeaderStyle}>Approved AFP</th>
                  <th style={tableHeaderStyle}>Approval Gap</th>
                  <th style={tableHeaderStyle}>Cost Base</th>
                  <th style={tableHeaderStyle}>Commercial Result</th>
                  <th style={tableHeaderStyle}>Recovery</th>
                  <th style={tableHeaderStyle}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {incomeStatementRows.map((row) => (
                  <tr key={row.label}>
                    <td style={leftCellStyle}>{row.label}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.submitted)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.approved)}</td>
                    <td style={{ ...tableCellStyle, color: row.approvalGap >= 0 ? theme.accentWarm : theme.accentStrong, fontWeight: 800 }}>{formatCurrency(row.approvalGap)}</td>
                    <td style={tableCellStyle}>{formatCurrency(row.cost)}</td>
                    <td style={{ ...tableCellStyle, color: profitColor(row.grossProfit), fontWeight: 800 }}>{formatCurrency(row.grossProfit)}</td>
                    <td style={tableCellStyle}>{formatPercent(row.recovery)}</td>
                    <td style={tableCellStyle}>{formatPercent(row.margin)}</td>
                  </tr>
                ))}
                <tr style={{ background: theme.accentSoft }}>
                  <td style={leftCellStyle}>Total</td>
                  <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatCurrency(submittedRevenue)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatCurrency(approvedRevenue)}</td>
                  <td style={{ ...tableCellStyle, color: approvalGap >= 0 ? theme.accentWarm : theme.accentStrong, fontWeight: 900 }}>{formatCurrency(approvalGap)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatCurrency(visibleTotal)}</td>
                  <td style={{ ...tableCellStyle, color: profitColor(revenueSurplus), fontWeight: 900 }}>{formatCurrency(revenueSurplus)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatPercent(recoveryRatio)}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 900 }}>{formatPercent(approvedRevenue ? revenueSurplus / approvedRevenue : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </details>
        </details>
      )}

      {activePage === "transactions" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Commercial Activity Detail</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Detailed commercial activity based on the selected filters.</p>
            </div>
            <strong style={{ color: theme.text }}>{sortedData.length.toLocaleString()} entries</strong>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={leftHeaderStyle}>Portfolio</th>
                  <th style={leftHeaderStyle}>Hub</th>
                  <th style={leftHeaderStyle}>Cost Center</th>
                  <th style={leftHeaderStyle}>Month</th>
                  <th style={leftHeaderStyle}>GL Name</th>
                  <th style={leftHeaderStyle}>Vendor</th>
                  <th style={tableHeaderStyle}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactionRows.map((row, index) => {
                  const hub = getHubForCostCenter(row.costCenter);
                  const portfolio = getPortfolioForHub(hub);
                  return (
                    <tr key={`${row.costCenter}-${row.month}-${row.category}-${index}`} style={{ background: index % 2 === 0 ? theme.panelBg : theme.rowAlt }}>
                      <td style={leftCellStyle}>{portfolio}</td>
                      <td style={leftCellStyle}>{hub}</td>
                      <td style={leftCellStyle}>{row.costCenter}</td>
                      <td style={leftCellStyle}>{row.month}</td>
                      <td style={leftCellStyle}>{row.category || "Uncategorized"}</td>
                      <td style={leftCellStyle}>{row.vendor || "Unspecified Vendor"}</td>
                      <td style={tableCellStyle}>{formatCurrency(row.amount)}</td>
                    </tr>
                  );
                })}
                {!sortedData.length && (
                  <tr>
                    <td colSpan={7} style={{ ...leftCellStyle, color: theme.subtext }}>No transactions match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sortedData.length > transactionPageSize && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", color: theme.subtext, fontSize: 12 }}>
              <span>Showing {(safeTransactionPage - 1) * transactionPageSize + 1}-{Math.min(safeTransactionPage * transactionPageSize, sortedData.length).toLocaleString()} of {sortedData.length.toLocaleString()} entries.</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setTransactionPage((current) => Math.max(1, current - 1))}
                  disabled={safeTransactionPage === 1}
                  style={{ padding: "7px 11px", borderRadius: 7, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: safeTransactionPage === 1 ? "not-allowed" : "pointer", opacity: safeTransactionPage === 1 ? 0.55 : 1, fontWeight: 850 }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionPage((current) => Math.min(transactionPageCount, current + 1))}
                  disabled={safeTransactionPage === transactionPageCount}
                  style={{ padding: "7px 11px", borderRadius: 7, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: safeTransactionPage === transactionPageCount ? "not-allowed" : "pointer", opacity: safeTransactionPage === transactionPageCount ? 0.55 : 1, fontWeight: 850 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="portal-info-strip" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 0, overflow: "hidden", marginTop: 18, borderRadius: 16, background: "linear-gradient(135deg, #041d36, #062b4f)", border: "1px solid rgba(148,163,184,0.22)", boxShadow: "0 18px 40px rgba(15,23,42,0.16)" }}>
        {portalInfoStrip.map(([title, detail, icon, color]) => (
          <div key={title} style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 28px", borderRight: "1px solid rgba(255,255,255,0.12)" }}>
            <span style={{ display: "inline-grid", placeItems: "center", minWidth: 58, height: 58, borderRadius: 999, background: `${color}22`, color, fontSize: 13, fontWeight: 950 }}>{icon}</span>
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 950 }}>{title}</div>
              <div style={{ marginTop: 3, color: "rgba(226,232,240,0.82)", fontSize: 13, lineHeight: 1.35 }}>{detail}</div>
            </div>
          </div>
        ))}
      </section>

      <table style={{ display: "none", width: "100%", borderCollapse: "collapse", backgroundColor: theme.panelBg, borderRadius: 8, overflow: "hidden", boxShadow: theme.cardShadow }}>
        <thead>
          <tr>
            <th
              onClick={() => toggleSort("costCenter")}
              style={{ border: "none", padding: 16, textAlign: "left", background: theme.accentSoft, color: theme.text, fontWeight: 700, cursor: "pointer" }}
            >
              Cost Center {sortBy === "costCenter" ? (sortAsc ? "▲" : "▼") : ""}
            </th>
            <th
              onClick={() => toggleSort("month")}
              style={{ border: "none", padding: 16, textAlign: "left", background: theme.accentSoft, color: theme.text, fontWeight: 700, cursor: "pointer" }}
            >
              Month {sortBy === "month" ? (sortAsc ? "▲" : "▼") : ""}
            </th>
            <th
              onClick={() => toggleSort("amount")}
              style={{ border: "none", padding: 16, textAlign: "right", background: theme.accentSoft, color: theme.text, fontWeight: 700, cursor: "pointer" }}
            >
              Amount {sortBy === "amount" ? (sortAsc ? "▲" : "▼") : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((d, i) => (
            <tr key={`${d.costCenter}-${d.month}-${i}-${safePage}`} style={{ background: i % 2 === 0 ? theme.panelBg : theme.rowAlt }}>
              <td style={{ border: `1px solid ${theme.border}`, padding: 10, color: theme.text }}>{d.costCenter}</td>
              <td style={{ border: `1px solid ${theme.border}`, padding: 10, color: theme.text }}>{d.month}</td>
              <td style={{ border: `1px solid ${theme.border}`, padding: 10, textAlign: "right", color: theme.text }}>{formatCurrency(d.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const getAccessCacheKey = (user) => `${ACCESS_CACHE_PREFIX}-${user.uid}`;

const readCachedAccess = (user) => {
  if (!user?.uid) return null;

  const cacheKey = getAccessCacheKey(user);
  try {
    const cachedAccess = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
    if (
      cachedAccess?.uid === user.uid &&
      cachedAccess?.email?.toLowerCase() === user.email?.trim().toLowerCase() &&
      Date.now() - Number(cachedAccess.cachedAt ?? 0) < ACCESS_CACHE_MS
    ) {
      console.log("[IGCC Auth] access cache hit", user.uid);
      return {
        uid: cachedAccess.uid,
        email: cachedAccess.email,
        role: cachedAccess.role === "Admin" ? "Admin" : "Viewer",
      };
    }
  } catch {
    window.sessionStorage.removeItem(cacheKey);
  }

  return null;
};

const writeCachedAccess = (user, session) => {
  window.sessionStorage.setItem(getAccessCacheKey(user), JSON.stringify({ ...session, cachedAt: Date.now() }));
};

const verifyAllowedAccessOnce = async (user) => {
  if (!user?.uid || !user?.email) return null;

  const cachedAccess = readCachedAccess(user);
  if (cachedAccess) return cachedAccess;

  const normalizedEmail = user.email.trim().toLowerCase();
  const role = APPROVED_ACCESS[normalizedEmail];
  console.log("[IGCC Auth] local approved access check", normalizedEmail, Boolean(role));

  if (!role) return null;

  const session = {
    uid: user.uid,
    email: user.email,
    role,
  };
  writeCachedAccess(user, session);
  return session;
};

const getAllowedAccess = (user) => verifyAllowedAccessOnce(user);

const getApprovedAccess = async (user) => {
  const access = await getAllowedAccess(user);

  if (!access) {
    return null;
  }

  return access;
};

const isEmailApproved = (email) => Boolean(APPROVED_ACCESS[String(email ?? "").trim().toLowerCase()]);

function LoginPage({ onAuthenticated, initialError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginTheme = {
    pageBg: "#f4f7fb",
    panelBg: "#fff",
    text: "#10233f",
    subtext: "#4a5568",
    accentStrong: "#0f766e",
    accentSoft: "#e6f5f2",
    accentWarm: "#b45309",
    border: "#cbd5e1",
    inputBg: "#f8fafc",
    danger: "#b00020",
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isFirebaseConfigured || !auth || !firebaseProjectId) {
      setError("Secure access is not configured yet. Please contact the dashboard administrator.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsSubmitting(true);

    try {
      if (mode === "signup" && password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      if (mode === "signup" && !isEmailApproved(normalizedEmail)) {
        setError("This email is not authorized. Please contact the Admin.");
        return;
      }

      const credential = mode === "signup"
        ? await createUserWithEmailAndPassword(auth, normalizedEmail, password)
        : await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const session = await getAllowedAccess(credential.user);

      if (!session) {
        await signOut(auth);
        throw new Error("Access denied. This email is not approved for the IGCC dashboard.");
      }

      if (mode === "signup") {
        setPassword("");
        setConfirmPassword("");
      }

      onAuthenticated(session);
    } catch (err) {
      const firebaseMessage = err?.code === "auth/email-already-in-use"
        ? "This email already has an account. Please log in, or reset the password from Firebase if needed."
        : err.message;
      setError(firebaseMessage || (mode === "signup" ? "Account setup failed." : "Login failed. Please check your email and password."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setNotice("");

    if (!isFirebaseConfigured || !auth) {
      setError("Secure access is not configured yet. Please contact the dashboard administrator.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your approved email first, then request a password reset.");
      return;
    }

    setIsSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, normalizedEmail, { url: window.location.href });
      setNotice(`Password reset email sent to ${normalizedEmail}. Please check your inbox or spam folder.`);
    } catch (err) {
      setError(err.message || "Could not send password reset email. Please check the email address and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: loginTheme.pageBg, color: loginTheme.text }}>
      <div className="login-grid" style={{ width: "min(980px, 100%)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: 18, alignItems: "stretch" }}>
        <section className="login-hero-panel" style={{ background: loginTheme.panelBg, border: `1px solid ${loginTheme.border}`, borderRadius: 8, padding: 28, boxShadow: "0 18px 45px rgba(15,23,42,0.10)" }}>
          <div style={{ width: 72, height: 72, borderRadius: 8, border: `1px solid ${loginTheme.border}`, background: loginTheme.inputBg, display: "grid", placeItems: "center", marginBottom: 18 }}>
            <img src={getPublicAssetUrl("favicon.svg")} alt="IGCC logo" style={{ width: 46, height: 46, objectFit: "contain" }} />
          </div>
          <div style={{ color: loginTheme.accentStrong, fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>IRAQ GATE CONTRACTING COMPANY</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 34, lineHeight: 1.08, letterSpacing: 0 }}>IGCC P&amp;L Dashboard</h1>
          <p style={{ margin: "12px 0 0", color: loginTheme.subtext, fontSize: 16, lineHeight: 1.55, maxWidth: 620 }}>
            Secure executive access for cost, AFP approval, profitability, and portfolio performance.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
            {["Approved Emails Only", "View-Only Access", "Protected Dashboard"].map((label) => (
              <span key={label} style={{ color: loginTheme.accentStrong, background: "rgba(15,118,110,0.10)", border: "1px solid rgba(15,118,110,0.25)", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>
                {label}
              </span>
            ))}
          </div>
        </section>

        <form className="login-form-panel" onSubmit={handleSubmit} style={{ background: loginTheme.panelBg, border: `1px solid ${loginTheme.border}`, borderRadius: 8, padding: 24, boxShadow: "0 18px 45px rgba(15,23,42,0.10)", display: "grid", gap: 14, alignSelf: "start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, letterSpacing: 0 }}>{mode === "signup" ? "Create your account" : "Log in to dashboard"}</h2>
            <p style={{ margin: "7px 0 0", color: loginTheme.subtext, fontSize: 13, lineHeight: 1.45 }}>
              {mode === "signup" ? "Use an approved IGCC email to set your password." : "Access is limited to approved IGCC dashboard users."}
            </p>
          </div>

          <label style={{ display: "grid", gap: 7, color: loginTheme.text, fontSize: 13, fontWeight: 850 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              style={{ padding: 12, borderRadius: 8, border: `1px solid ${loginTheme.border}`, background: loginTheme.inputBg, color: loginTheme.text, fontSize: 14 }}
            />
          </label>

          <label style={{ display: "grid", gap: 7, color: loginTheme.text, fontSize: 13, fontWeight: 850 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              style={{ padding: 12, borderRadius: 8, border: `1px solid ${loginTheme.border}`, background: loginTheme.inputBg, color: loginTheme.text, fontSize: 14 }}
            />
          </label>

          {mode === "signup" && (
            <label style={{ display: "grid", gap: 7, color: loginTheme.text, fontSize: 13, fontWeight: 850 }}>
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                style={{ padding: 12, borderRadius: 8, border: `1px solid ${loginTheme.border}`, background: loginTheme.inputBg, color: loginTheme.text, fontSize: 14 }}
              />
            </label>
          )}

          {notice && <div style={{ color: loginTheme.accentStrong, background: "rgba(15,118,110,0.10)", border: "1px solid rgba(15,118,110,0.20)", borderRadius: 8, padding: 11, fontSize: 13, lineHeight: 1.4 }}>{notice}</div>}
          {error && <div style={{ color: loginTheme.danger, background: "rgba(176,0,32,0.08)", border: "1px solid rgba(176,0,32,0.18)", borderRadius: 8, padding: 11, fontSize: 13, lineHeight: 1.4 }}>{error}</div>}
          {mode === "signup" && email.trim() && !isEmailApproved(email) && !error && (
            <div style={{ color: loginTheme.danger, background: "rgba(176,0,32,0.08)", border: "1px solid rgba(176,0,32,0.18)", borderRadius: 8, padding: 11, fontSize: 13, lineHeight: 1.4 }}>
              This email is not authorized. Please contact the Admin.
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ border: "none", borderRadius: 8, padding: "13px 16px", cursor: isSubmitting ? "wait" : "pointer", background: loginTheme.accentStrong, color: "#fff", fontWeight: 950, fontSize: 15 }}
          >
            {isSubmitting ? "Verifying..." : mode === "signup" ? "Create account" : "Log in"}
          </button>

          {mode === "login" && (
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={isSubmitting}
              style={{ border: "none", background: "transparent", color: loginTheme.accentStrong, cursor: isSubmitting ? "wait" : "pointer", fontSize: 13, fontWeight: 900, padding: 0, justifySelf: "center" }}
            >
              Forgot password?
            </button>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, color: loginTheme.subtext, fontSize: 12 }}>
            <span style={{ height: 1, background: "#e2e8f0" }} />
            <span>or</span>
            <span style={{ height: 1, background: "#e2e8f0" }} />
          </div>

          <button
            type="button"
            onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
            style={{ border: `1px solid rgba(15,118,110,0.28)`, borderRadius: 8, padding: "12px 16px", cursor: "pointer", background: loginTheme.accentSoft, color: loginTheme.accentStrong, fontWeight: 950, fontSize: 14 }}
          >
            {mode === "signup" ? "Already have an account? Log in" : "Create new account"}
          </button>

          <p style={{ margin: 0, textAlign: "center", color: loginTheme.subtext, fontSize: 12, lineHeight: 1.45 }}>
            {mode === "signup" ? "New emails must be approved by Admin." : "New users must use an approved email address."}
          </p>
        </form>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[IGCC Dashboard] render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const clearAndReload = () => {
      window.sessionStorage.clear();
      window.localStorage.clear();
      window.location.reload();
    };

    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: "#f4f7fb", color: "#10233f" }}>
        <div style={{ width: "min(560px, 100%)", border: "1px solid #cbd5e1", borderRadius: 10, padding: 24, background: "#fff", boxShadow: "0 18px 45px rgba(15,23,42,0.10)" }}>
          <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Dashboard recovery</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 24 }}>The dashboard needs a clean refresh</h1>
          <p style={{ margin: "10px 0 0", color: "#475569", lineHeight: 1.5 }}>
            A saved browser session caused the page to stop rendering. Clear the saved dashboard session and reload to continue.
          </p>
          <button type="button" onClick={clearAndReload} style={{ marginTop: 16, border: 0, borderRadius: 8, padding: "12px 16px", background: "#0f766e", color: "#fff", cursor: "pointer", fontWeight: 950 }}>
            Clear saved session and reload
          </button>
          <pre style={{ marginTop: 16, whiteSpace: "pre-wrap", color: "#64748b", fontSize: 11, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>{String(this.state.error?.message || this.state.error || "")}</pre>
        </div>
      </div>
    );
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !firebaseProjectId) {
      setIsCheckingAuth(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        setIsCheckingAuth(false);
        return;
      }

      const cachedSession = readCachedAccess(user);
      if (cachedSession) {
        setAuthError("");
        setSession(cachedSession);
        setIsCheckingAuth(false);
        return;
      }

      try {
        setAuthError("");
        const session = await getApprovedAccess(user);
        if (!session) {
          await signOut(auth);
          setSession(null);
          setIsCheckingAuth(false);
          return;
        }

        setSession(session);
      } catch (err) {
        console.log("[IGCC Auth] session restore skipped", err?.code || err?.message);
        setAuthError("");
        await signOut(auth);
        setSession(null);
      } finally {
        setIsCheckingAuth(false);
      }
    });
  }, []);

  const handleLogout = async () => {
    setAuthError("");
    if (auth) await signOut(auth);
    setSession(null);
  };

  if (isCheckingAuth) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: "#f4f7fb", color: "#10233f" }}>
        <div style={{ width: "min(420px, 100%)", border: "1px solid #cbd5e1", borderRadius: 8, padding: 22, background: "#fff", textAlign: "center", boxShadow: "0 18px 45px rgba(15,23,42,0.10)" }}>
          <div style={{ color: "#0f766e", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Secure Access</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 24 }}>Verifying session</h1>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onAuthenticated={setSession} initialError={authError} />;
  }

  return (
    <AppErrorBoundary>
      <DashboardApp session={session} onLogout={handleLogout} />
    </AppErrorBoundary>
  );
}
