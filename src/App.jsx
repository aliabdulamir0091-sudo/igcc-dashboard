import { Fragment, useEffect, useState } from "react";
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
  const [filename, setFilename] = useState("");
  const [revenueFilename, setRevenueFilename] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ portfolio: "", hub: "", costCenter: "", month: "", year: "" });
  const [detailCostCenter, setDetailCostCenter] = useState("KAZ_23");
  const [periodView, setPeriodView] = useState("monthly");
  const [overviewPeriodView, setOverviewPeriodView] = useState("monthly");
  const [activePage, setActivePage] = useState("home");
  const [transactionPage, setTransactionPage] = useState(1);
  const [spentGroupBy, setSpentGroupBy] = useState("gl");
  const [spentSelectedGroupKey, setSpentSelectedGroupKey] = useState("");
  const [spentDetailSort, setSpentDetailSort] = useState({ field: "amount", direction: "desc" });
  const [themeMode, setThemeMode] = useState("light");
  const [showWelcome, setShowWelcome] = useState(false);
  const [expandedProfitRows, setExpandedProfitRows] = useState({});
  const [spentEntryMessage, setSpentEntryMessage] = useState("");
  const [spentEntryError, setSpentEntryError] = useState("");
  const [isLoadingFullSpentDetails, setIsLoadingFullSpentDetails] = useState(false);
  const [loadedSpentDetailPeriods, setLoadedSpentDetailPeriods] = useState([]);
  const [spentImportSummary, setSpentImportSummary] = useState(null);

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

    Promise.all([loadSpentSummary(), loadBundledRevenue().then(() => [])])
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
  const filteredData = data.filter((item) => matchesCostFilters(item));
  const filteredRevenueData = revenueData.filter((item) => matchesRevenueFilters(item));
  const comparisonData = data.filter((item) => matchesCostFilters(item, { includeMonth: false }));
  const comparisonRevenueData = revenueData.filter((item) => matchesRevenueFilters(item, { includeMonth: false }));

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
  const selectedSpentGroup = spentGroupedRows.find((row) => row.key === spentSelectedGroupKey);
  const spentSelectedRows = selectedSpentGroup
    ? filteredData.filter((item) => getSpentGroupInfo(item, spentGroupBy).key === spentSelectedGroup.key)
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
  const overviewPeriodTotals = aggregateByPeriod(filteredData, overviewPeriodView);
  const chartPeriods = overviewPeriodTotals.slice(-8);
  const maxChartPeriodAmount = Math.max(...chartPeriods.map((item) => Math.abs(item.amount)), 0);
  const centerSummaryRows = hubCostCenterBreakdown
    .flatMap((hub) =>
      hub.centers.map((center) => ({
        portfolio: getPortfolioForHub(hub.label),
        hub: hub.label,
        costCenter: center.center,
        cost: center.amount,
        submitted: center.submitted,
        approved: center.approved,
        gap: center.submitted - center.approved,
        net: center.approved - center.amount,
        margin: center.approved ? (center.approved - center.amount) / center.approved : center.amount ? -1 : 0,
        rows: center.rows,
      }))
    )
    .filter((row) => row.cost || row.submitted || row.approved)
    .sort((a, b) => b.cost - a.cost);
  const profitabilityRows = centerSummaryRows
    .map((row) => ({
      ...row,
      approvedNet: row.approved - row.cost,
      expectedNet: row.submitted - row.cost,
      approvedMargin: row.approved ? (row.approved - row.cost) / row.approved : row.cost ? -1 : 0,
      expectedMargin: row.submitted ? (row.submitted - row.cost) / row.submitted : row.cost ? -1 : 0,
    }))
    .sort((a, b) => a.approvedNet - b.approvedNet || a.expectedNet - b.expectedNet);
  const profitabilityFocusRows = [...profitabilityRows]
    .sort((a, b) => a.approvedNet - b.approvedNet || b.cost - a.cost)
    .slice(0, 10);
  const maxProfitabilityExposure = Math.max(...profitabilityFocusRows.map((row) => Math.abs(row.approvedNet)), 0);
  const bestProfitabilityRow = [...profitabilityRows].sort((a, b) => b.approvedNet - a.approvedNet)[0];
  const riskProfitabilityRow = profitabilityFocusRows[0];
  const positiveProfitabilityCount = profitabilityRows.filter((row) => row.approvedNet >= 0).length;
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
  const hubsWithoutApprovedRevenue = hubPerformanceSummaryRows
    .filter((row) => row.cost > 0 && row.approved <= 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 3);
  const hubsWithApprovedRevenue = hubPerformanceSummaryRows
    .filter((row) => row.approved > 0)
    .sort((a, b) => a.net - b.net || b.cost - a.cost)
    .slice(0, 3);
  const maxTopHubRiskValue = Math.max(
    ...[...hubsWithoutApprovedRevenue, ...hubsWithApprovedRevenue].flatMap((row) => [Math.abs(row.cost), Math.abs(row.approved)]),
    0
  );
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
  const insightContextLabel = filters.month ? `Monthly Insights - ${filters.month}` : "Strategic Insights - All Months";
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
    <div style={{ minHeight: "100vh", padding: "8px 16px 28px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 1280, margin: "0 auto", color: theme.text, background: themeMode === "light" ? "linear-gradient(180deg, #eef5fb 0%, #f8fbff 42%, #ffffff 100%)" : theme.pageBg }}>
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

      {isLoading && (
        <div style={{ marginBottom: 12, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", boxShadow: theme.cardShadow, color: theme.subtext, fontSize: 13, fontWeight: 850 }}>
          Loading financial data in the background...
        </div>
      )}

      <div style={{ marginBottom: 12, overflow: "hidden", background: "linear-gradient(135deg, #041d36 0%, #062b4f 58%, #073861 100%)", border: "1px solid rgba(148, 163, 184, 0.24)", borderRadius: 14, padding: 0, boxShadow: "0 18px 42px rgba(15, 23, 42, 0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, border: "1px solid rgba(255,255,255,0.16)", background: "linear-gradient(135deg, rgba(20,184,166,0.24), rgba(37,99,235,0.18))", display: "grid", placeItems: "center", flex: "0 0 auto", overflow: "hidden", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)" }}>
              <img src={getPublicAssetUrl("favicon.svg")} alt="IGCC logo" style={{ width: 42, height: 42, objectFit: "contain" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#67e8f9", fontSize: 11, fontWeight: 950, letterSpacing: 0, textTransform: "uppercase" }}>IRAQ GATE CONTRACTING COMPANY</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 27, letterSpacing: 0, lineHeight: 1.02, fontWeight: 950, color: "#ffffff" }}>Financial Dashboard</h1>
              <p style={{ margin: "7px 0 0", color: "rgba(226,232,240,0.86)", fontSize: 13, maxWidth: 720 }}>Executive view of cost, AFP approval, profitability, and portfolio performance.</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", justifyContent: "flex-end", borderLeft: "1px solid rgba(255,255,255,0.16)", paddingLeft: 22 }}>
            <div style={{ color: "rgba(226,232,240,0.78)", fontSize: 12, fontWeight: 850, textAlign: "left", lineHeight: 1.42 }}>
              <div style={{ color: "rgba(226,232,240,0.78)", fontWeight: 800 }}>Welcome,</div>
              <div style={{ color: "#fff", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 950 }}>{portalUserName}</div>
              <div><span style={{ color: "#22d3ee", textTransform: "uppercase" }}>{session?.role ?? "Viewer"}</span> | Last updated: {lastUpdatedLabel}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              style={{ padding: "14px 24px", cursor: "pointer", backgroundColor: "rgba(255,255,255,0.07)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 16, fontWeight: 950, fontSize: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
            >
              Logout
            </button>
          </div>
        </div>
        {activePage !== "home" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 26px 12px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", columnGap: 12, rowGap: 12, alignItems: "end", padding: "16px 26px 18px", borderTop: "1px solid rgba(255,255,255,0.12)", background: "rgba(2, 12, 27, 0.18)" }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", margin: "-12px 0 24px", flexWrap: "wrap", background: "linear-gradient(135deg, #06213d, #082d50)", border: "1px solid rgba(148, 163, 184, 0.22)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "14px 26px", boxShadow: "0 14px 34px rgba(15,23,42,0.14)" }}>
        <div style={{ display: "inline-flex", gap: 10, padding: 0, borderRadius: 12, flexWrap: "wrap" }}>
          {visibleNavItems.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActivePage(value)}
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

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {[
              ["Total Spend", formatCompactCurrency(spentTotalAmount), "Filtered spend value", "TS", "#0f766e"],
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

          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Spend Explorer</h3>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Grouped visual summary for the current filter selection.</p>
            </div>
            <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 12, background: theme.accentSoft, border: `1px solid ${theme.border}`, flexWrap: "wrap" }}>
              {spentGroupOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleSpentGroupChange(value)}
                  style={{ border: "none", borderRadius: 9, padding: "9px 12px", cursor: "pointer", background: spentGroupBy === value ? theme.panelBg : "transparent", color: spentGroupBy === value ? theme.accentStrong : theme.text, boxShadow: spentGroupBy === value ? "0 4px 14px rgba(15,23,42,0.10)" : "none", fontSize: 12, fontWeight: 950 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
            {spentGroupedRows.slice(0, 18).map((row, index) => {
              const width = maxSpentGroupAmount ? Math.max(4, Math.round((Math.abs(row.amount) / maxSpentGroupAmount) * 100)) : 0;
              const costShare = spentTotalAmount ? row.amount / spentTotalAmount : 0;
              const revenueShare = approvedRevenue ? row.amount / approvedRevenue : null;
              return (
                <div
                  key={row.key}
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

          {renderExecutiveInsights(insightContextLabel, keyInsights)}

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(240px, 0.72fr) minmax(0, 1.28fr)", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
            <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${profitColor(revenueSurplus)}33`, borderRadius: 14, padding: "22px 22px", background: `linear-gradient(145deg, #ffffff 0%, ${revenueSurplus >= 0 ? "#f1fdf8" : "#fff5f5"} 100%)`, boxShadow: "0 16px 34px rgba(15,23,42,0.10)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
              <div style={{ position: "absolute", right: -30, bottom: -30, width: 130, height: 130, borderRadius: "50%", background: `${profitColor(revenueSurplus)}14` }} />
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
                  ["Total Cost", formatCompactCurrency(visibleTotal), getKpiChange("cost", true), theme.accentWarm],
                  ["Submitted AFP", formatCompactCurrency(submittedRevenue), getKpiChange("submitted"), "#2563eb"],
                  ["Approved AFP", formatCompactCurrency(approvedRevenue), getKpiChange("approved"), "#059669"],
                ].map(([label, value, change, accent]) => (
                  <div key={label} style={{ position: "relative", overflow: "hidden", border: `1px solid ${accent}20`, borderRadius: 14, padding: "18px 18px", background: `linear-gradient(145deg, #ffffff 0%, ${accent}0d 100%)`, minWidth: 0, boxShadow: "0 14px 30px rgba(15,23,42,0.08)", transition: "transform 160ms ease, box-shadow 160ms ease" }}>
                    <div style={{ position: "absolute", right: 12, bottom: 10, width: 110, height: 44, opacity: 0.22 }}>
                      <svg viewBox="0 0 110 44" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
                        <path d="M3 35 C20 23, 31 30, 44 18 S72 26, 88 8 S101 16, 107 5" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div style={{ color: "#334155", fontSize: 10, lineHeight: 1, fontWeight: 950, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 10 }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 7, whiteSpace: "nowrap", minHeight: 18 }}>
                      <strong style={{ color: accent === theme.accentWarm ? "#2563eb" : accent, fontSize: 24, lineHeight: 1, fontWeight: 950 }}>{value}</strong>
                      <span style={{ color: change.color, opacity: change.muted ? 0.58 : 1, fontSize: change.muted ? 10 : 12, lineHeight: 1, fontWeight: change.muted ? 800 : 950 }}>{change.arrow} {change.text}</span>
                    </div>
                    <div style={{ marginTop: 10, color: "#64748b", opacity: 0.85, fontSize: 11, lineHeight: 1 }}>{change.muted ? "All months" : "vs previous month"}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: "#334155", fontSize: 14, fontWeight: 900, display: "flex", gap: 18, flexWrap: "wrap", padding: "14px 18px", alignItems: "center", justifyContent: "center", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, background: "rgba(255,255,255,0.76)", boxShadow: "0 10px 24px rgba(15,23,42,0.05)" }}>
                <span>Approval Rate: <strong style={{ color: approvalRate >= 0.85 ? "#059669" : "#b45309" }}>{formatPercent(approvalRate)}</strong></span>
                <span style={{ color: "#cbd5e1" }}>|</span>
                <span>Cost Coverage: <strong style={{ color: costCoverage >= 1 ? "#059669" : "#dc2626" }}>{formatPercent(costCoverage)}</strong></span>
              </div>
            </div>
          </div>

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
              <h2 style={{ margin: 0, color: "#071a3a", fontSize: 20, fontWeight: 950 }}>Performance Charts</h2>
              <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Trend, concentration, and cost drivers for the current selection.</p>
            </div>
            {latestTrendRow && (
              <span style={{ color: profitColor(latestTrendRow.net), background: "#f8fafc", border: "1px solid rgba(148,163,184,0.22)", borderRadius: 999, padding: "9px 13px", fontSize: 12, fontWeight: 950 }}>
                Latest {latestTrendRow.label}: {formatCompactCurrency(latestTrendRow.cost)} cost vs {formatCompactCurrency(latestTrendRow.approved)} approved
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)", gap: 16, marginBottom: 16 }}>
            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 18, background: "#fff", minHeight: 250, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Monthly Trend</h3>
                <div style={{ display: "flex", gap: 12, color: "#64748b", fontSize: 11 }}>
                  <span><strong style={{ color: theme.accentWarm }}>Cost</strong></span>
                  <span><strong style={{ color: "#059669" }}>Approved AFP</strong></span>
                </div>
              </div>
              {executiveTrendRows.length ? (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Monthly trend line chart comparing cost and approved AFP" style={{ width: "100%", height: 160, display: "block" }}>
                  <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="rgba(148,163,184,0.28)" strokeWidth="1" />
                  <line x1={chartPadding} y1={chartPadding} x2={chartPadding} y2={chartHeight - chartPadding} stroke="rgba(148,163,184,0.20)" strokeWidth="1" />
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
              <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Cost by Hub</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {hubHistogramRows.slice(0, 8).map((hub, index) => {
                  const section = HUB_SECTIONS.find((item) => item.hubs.includes(hub.label));
                  const contribution = visibleTotal ? hub.amount / visibleTotal : 0;
                  const accent = contribution >= 0.35 ? theme.danger : contribution >= 0.2 ? theme.accentWarm : section?.accent ?? theme.accentStrong;
                  const width = `${Math.max(3, (Math.abs(hub.amount) / (maxHubHistogramAmount || 1)) * 100)}%`;

                  return (
                    <div key={hub.label} style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 138px", gap: 8, alignItems: "center", padding: index === 0 ? "3px 0" : 0 }}>
                      <span style={{ color: accent, fontSize: 12, fontWeight: 900 }}>{hub.label}</span>
                      <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                      </div>
                      <span style={{ color: index === 0 ? accent : theme.text, fontSize: 12, fontWeight: index === 0 ? 950 : 900, textAlign: "right" }}>{formatCompactCurrency(hub.amount)} <span style={{ color: theme.subtext, fontSize: 10 }}>({formatPercent(contribution)})</span></span>
                    </div>
                  );
                })}
                {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub performance matches the current filters.</div>}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 18, background: "#fff", minHeight: 210, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Hub Risk Classification</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 9 }}>
                {[
                  ["No Approved Revenue", hubsWithoutApprovedRevenue, theme.danger],
                  ["With Approved Revenue", hubsWithApprovedRevenue, theme.accentStrong],
                ].map(([groupLabel, rows, groupColor]) => (
                  <div key={groupLabel} style={{ display: "grid", gap: 7, alignContent: "start" }}>
                    <div style={{ color: groupColor, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{groupLabel}</div>
                    {rows.map((row) => (
                      <div key={`${groupLabel}-${row.hub}`} style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr) 104px", gap: 7, alignItems: "center" }}>
                        <span style={{ color: row.net < 0 ? theme.danger : theme.text, fontSize: 12, fontWeight: 900 }}>{row.hub}</span>
                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ height: 7, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }} title="Cost">
                            <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxTopHubRiskValue || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentWarm }} />
                          </div>
                          <div style={{ height: 7, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }} title="Approved AFP">
                            <div style={{ width: `${Math.max(3, (Math.abs(row.approved) / (maxTopHubRiskValue || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: theme.accentStrong }} />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 10, color: theme.subtext, lineHeight: 1.2 }}>
                          <div>{formatCompactCurrency(row.cost)} cost</div>
                          <strong style={{ color: profitColor(row.net), fontSize: 12 }}>{formatCompactCurrency(row.net)} net</strong>
                        </div>
                      </div>
                    ))}
                    {!rows.length && <div style={{ color: theme.subtext, fontSize: 12 }}>No hubs in this classification.</div>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 14, padding: 18, background: "#fff", minHeight: 210, boxSizing: "border-box", boxShadow: "0 16px 38px rgba(15,23,42,0.09)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <h3 style={{ margin: 0, color: "#071a3a", fontSize: 16, fontWeight: 950 }}>Cost by GL Name</h3>
                {costByGlRows[0] && <span style={{ color: theme.accentStrong, fontSize: 11, fontWeight: 900 }}>Top driver: {costByGlRows[0].glName}</span>}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {costByGlRows.slice(0, 5).map((row, index) => (
                  <div key={row.glName} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(0, 1fr) 130px", gap: 8, alignItems: "center" }}>
                    <span style={{ color: index === 0 ? theme.accentStrong : theme.text, fontSize: 12, fontWeight: index === 0 ? 950 : 850, overflowWrap: "anywhere" }}>{row.glName}</span>
                    <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, (Math.abs(row.cost) / (maxGlCost || 1)) * 100)}%`, height: "100%", borderRadius: 999, background: index === 0 ? theme.accentStrong : "#0e7490" }} />
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
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Profit &amp; Loss Drilldown</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Expand from portfolio to hub, cost center, the global filter selection, and GL-name cost detail.</p>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, minWidth: "min(100%, 560px)" }}>
                {[
                  ["Cost", visibleTotal, theme.accentWarm],
                  ["Approved AFP", approvedRevenue, theme.accentStrong],
                  ["Profit", revenueSurplus, profitColor(revenueSurplus)],
                  ["Margin", approvedRevenue ? revenueSurplus / approvedRevenue : visibleTotal ? -1 : 0, profitColor(revenueSurplus)],
                ].map(([label, value, accent]) => (
                  <div key={label} style={{ border: `1px solid ${theme.border}`, borderLeft: `4px solid ${accent}`, borderRadius: 8, padding: "8px 10px", background: theme.inputBg }}>
                    <div style={{ color: theme.subtext, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 5, color: accent, fontSize: 17, fontWeight: 950, whiteSpace: "nowrap" }}>{label === "Margin" ? formatPercent(value) : formatCompactCurrency(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {renderExecutiveInsights("Profitability Narrative", profitabilityInsights)}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              ["Cost", formatCompactCurrency(visibleTotal), "Filtered cost base", "CO", theme.accentWarm],
              ["Approved AFP", formatCompactCurrency(approvedRevenue), "Recognized value", "AF", theme.accentStrong],
              ["Best Center", bestProfitabilityRow?.costCenter || "No data", bestProfitabilityRow ? formatCompactCurrency(bestProfitabilityRow.approvedNet) : "-", "BC", "#2563eb"],
              ["At Risk Center", riskProfitabilityRow?.costCenter || "No data", riskProfitabilityRow ? formatCompactCurrency(riskProfitabilityRow.approvedNet) : "-", "RC", theme.danger],
              ["Positive Centers", `${positiveProfitabilityCount}/${profitabilityRows.length || 0}`, "Approved profit position", "PC", "#16a34a"],
            ].map(([label, value, detail, icon, accent]) => (
              <div className="executive-hover-card" key={label} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.08)", transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: `${accent}14`, color: accent, fontSize: 13, fontWeight: 950 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 7, color: accent, fontSize: 22, lineHeight: 1.1, fontWeight: 950, overflowWrap: "anywhere" }}>{value}</div>
                    <div style={{ marginTop: 9, color: theme.subtext, fontSize: 12 }}>{detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, background: themeMode === "light" ? "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" : theme.inputBg, boxShadow: "0 12px 28px rgba(15,23,42,0.07)", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Profitability Explorer</h3>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 12 }}>Cost centers ranked by approved profit position.</p>
              </div>
              <span style={{ color: theme.subtext, fontSize: 12, fontWeight: 900 }}>{profitabilityFocusRows.length} priority centers</span>
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

          <details style={{ border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden", background: theme.panelBg }}>
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
          </details>
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

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 0, overflow: "hidden", marginTop: 18, borderRadius: 16, background: "linear-gradient(135deg, #041d36, #062b4f)", border: "1px solid rgba(148,163,184,0.22)", boxShadow: "0 18px 40px rgba(15,23,42,0.16)" }}>
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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: loginTheme.pageBg, color: loginTheme.text }}>
      <div style={{ width: "min(980px, 100%)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: 18, alignItems: "stretch" }}>
        <section style={{ background: loginTheme.panelBg, border: `1px solid ${loginTheme.border}`, borderRadius: 8, padding: 28, boxShadow: "0 18px 45px rgba(15,23,42,0.10)" }}>
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

        <form onSubmit={handleSubmit} style={{ background: loginTheme.panelBg, border: `1px solid ${loginTheme.border}`, borderRadius: 8, padding: 24, boxShadow: "0 18px 45px rgba(15,23,42,0.10)", display: "grid", gap: 14, alignSelf: "start" }}>
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

  return <DashboardApp session={session} onLogout={handleLogout} />;
}
