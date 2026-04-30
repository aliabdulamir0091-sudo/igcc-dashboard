import { useEffect, useState } from "react";
import Papa from "papaparse";
import { read, utils } from "xlsx";

const formatCurrency = (value) =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

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

const MASTER_SPENT_REPORT_FILE = "Master Spent Report.xlsx";
const IGCC_LEVEL_LABEL = "IGCC Level 1 - IRAQ GATE CONTRACTING COMPANY";
const NAV_ITEMS = [
  ["overview", "Overview"],
  ["performance", "Performance"],
  ["detail", "Cost Details"],
  ["income", "Commercial Statement"],
];
const PERIOD_OPTIONS = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
];
const VIEW_ONLY_MODE = true;
const WELCOME_MESSAGE = "Welcome to this dashboard; Ali Abdulamir is developing this application, and this is not the final revision.";
const WELCOME_VOICE_MESSAGE = "Welcome to this dashboard. This application is developed by Ali Abdulamir, and this is not the final revision.";
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

export default function App() {
  const [data, setData] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [filename, setFilename] = useState("");
  const [revenueFilename, setRevenueFilename] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ costCenter: "", month: "" });
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [detailCostCenter, setDetailCostCenter] = useState("KAZ_23");
  const [periodView, setPeriodView] = useState("monthly");
  const [overviewPeriodView, setOverviewPeriodView] = useState("monthly");
  const [activePage, setActivePage] = useState("overview");
  const [themeMode, setThemeMode] = useState("light");
  const [showWelcome, setShowWelcome] = useState(true);

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
  const dismissWelcome = () => {
    window.speechSynthesis?.cancel();
    setShowWelcome(false);
  };
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

  const loadingView = (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif", color: theme.text, backgroundColor: theme.pageBg }}>
      <div style={{ width: "min(520px, 100%)", background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 24, boxShadow: theme.cardShadow, textAlign: "center" }}>
        <div style={{ color: theme.accentStrong, fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>Loading Dashboard</div>
        <h1 style={{ margin: "10px 0", fontSize: 28, letterSpacing: 0, color: theme.text }}>Preparing cost and revenue data</h1>
        <p style={{ margin: 0, color: theme.subtext }}>Reading the master spent report and revenue workbook.</p>
        {error && <p style={{ marginTop: 14, color: theme.danger }}>{error}</p>}
      </div>
    </div>
  );

  useEffect(() => {
    let isMounted = true;

    const loadBundledReport = async () => {
      try {
        const response = await fetch(`/${encodeURIComponent(MASTER_SPENT_REPORT_FILE)}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const workbook = read(new Uint8Array(buffer), { type: "array", cellDates: true });

        if (isMounted) {
          setData(parseSpentWorkbook(workbook));
          setFilename(MASTER_SPENT_REPORT_FILE);
        }
      } catch (err) {
        if (isMounted) {
          setError(`Failed to load bundled ${MASTER_SPENT_REPORT_FILE}: ${err.message}`);
        }
      }
    };

    const loadBundledRevenue = async () => {
      try {
        const response = await fetch("/Revenue.xlsx");
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
          setError(`Failed to load bundled Revenue.xlsx: ${err.message}`);
        }
      }
    };

    Promise.allSettled([loadBundledReport(), loadBundledRevenue()]).finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFilterChange = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleCostCenterSelect = (event) => {
    setSelectedCostCenter(event.target.value);
  };

  const filteredData = data.filter((item) => {
    const costMatch = item.costCenter.toLowerCase().includes(filters.costCenter.toLowerCase());
    const monthMatch = item.month.toLowerCase().includes(filters.month.toLowerCase());
    const selectedMatch = selectedCostCenter ? item.costCenter === selectedCostCenter : true;
    return costMatch && monthMatch && selectedMatch;
  });

  const filteredRevenueData = revenueData.filter((item) => {
    const costMatch = item.costCenter.toLowerCase().includes(filters.costCenter.toLowerCase());
    const monthMatch = item.month.toLowerCase().includes(filters.month.toLowerCase());
    const selectedMatch = selectedCostCenter ? item.costCenter === selectedCostCenter : true;
    return costMatch && monthMatch && selectedMatch;
  });

  const sortedData = [...filteredData].sort((a, b) => b.amount - a.amount);
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
  const highestPeriod = [...periodTotals].sort((a, b) => b.amount - a.amount)[0];
  const averagePeriod = periodTotals.length
    ? periodTotals.reduce((sum, item) => sum + item.amount, 0) / periodTotals.length
    : 0;
  const total = data.reduce((sum, d) => sum + d.amount, 0);
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
      .filter((center) => center.rows > 0 || center.submitted !== 0 || center.approved !== 0 || (!filters.costCenter && !filters.month && !selectedCostCenter))
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
  const unsectionedHubBreakdown = hubCostCenterBreakdown.filter(
    (hub) => !HUB_SECTIONS.some((section) => section.hubs.includes(hub.label))
  );
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
  const detailCategoryRows = [
    ...COST_CATEGORY_ORDER.map((category, index) => {
      const rows = detailFilteredCostRows.filter((item) => normalizeValue(item.category).toLowerCase() === normalizeValue(category).toLowerCase());
      const amount = rows.reduce((sum, item) => sum + item.amount, 0);

      return {
        category,
        amount,
        rows: rows.length,
        order: index,
      };
    }),
    ...Array.from(
      detailFilteredCostRows
        .reduce((map, item) => {
          const category = item.category || "Uncategorized";
          const isKnown = COST_CATEGORY_ORDER.some((known) => normalizeValue(known).toLowerCase() === normalizeValue(category).toLowerCase());
          if (isKnown) return map;

          const current = map.get(category) ?? { category, amount: 0, rows: 0, order: COST_CATEGORY_ORDER.length + map.size };
          current.amount += item.amount;
          current.rows += 1;
          map.set(category, current);
          return map;
        }, new Map())
        .values()
    ),
  ].filter((row) => row.amount || row.rows);
  const detailMaxCategoryAmount = Math.max(...detailCategoryRows.map((row) => Math.abs(row.amount)), 0);

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
  const panelStyle = { marginBottom: 24, backgroundColor: theme.panelBg, padding: 18, borderRadius: 8, border: `1px solid ${theme.border}`, boxShadow: theme.cardShadow };
  const tableHeaderStyle = { border: `1px solid ${theme.border}`, padding: 10, textAlign: "right", background: theme.accentSoft, color: theme.text };
  const tableCellStyle = { border: `1px solid ${theme.border}`, padding: 10, textAlign: "right", color: theme.text };
  const leftHeaderStyle = { ...tableHeaderStyle, textAlign: "left" };
  const leftCellStyle = { ...tableCellStyle, textAlign: "left", fontWeight: 700 };
  const profitColor = (value) => (value >= 0 ? theme.accentStrong : theme.danger);
  const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
  const renderPeriodToggleFor = (value, onChange) => (
    <div onClick={(event) => event.stopPropagation()} style={{ display: "inline-flex", gap: 4, padding: 4, background: theme.accentSoft, borderRadius: 8 }}>
      {PERIOD_OPTIONS.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "9px 14px",
            cursor: "pointer",
            fontWeight: 700,
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
  const revenueCoverage = Math.min(Math.max(recoveryRatio * 100, 0), 140);
  const approvedShare = submittedRevenue ? Math.min(Math.max((approvedRevenue / submittedRevenue) * 100, 0), 100) : 0;
  const summaryMetrics = [
    {
      label: "Current Selection",
      caption: "Spend after active filters",
      value: formatCurrency(visibleTotal),
      detail: `${filteredData.length.toLocaleString()} matching transactions`,
      accent: theme.accentStrong,
      tone: "Operational",
      progress: total ? Math.min((visibleTotal / total) * 100, 100) : 0,
    },
    {
      label: "Submitted Revenue",
      caption: "AFP submitted by cost center",
      value: formatCurrency(submittedRevenue),
      detail: `${filteredRevenueData.filter((item) => item.status === "submitted").length.toLocaleString()} revenue entries`,
      accent: "#2563eb",
      tone: "Pipeline",
      progress: submittedRevenue ? 100 : 0,
    },
    {
      label: "Approved Revenue",
      caption: "AFP approved by cost center",
      value: formatCurrency(approvedRevenue),
      detail: `${filteredRevenueData.filter((item) => item.status === "approved").length.toLocaleString()} revenue entries`,
      accent: "#059669",
      tone: "Recognized",
      progress: approvedShare,
    },
    {
      label: "Approved vs Cost",
      caption: "Commercial recovery position",
      value: formatCurrency(revenueSurplus),
      detail: `${formatPercent(recoveryRatio)} approved revenue coverage`,
      accent: revenueSurplus >= 0 ? theme.accentStrong : theme.danger,
      tone: revenueSurplus >= 0 ? "Surplus" : "Shortfall",
      progress: revenueCoverage,
    },
    {
      label: "Approval Gap",
      caption: "Submitted less approved",
      value: formatCurrency(approvalGap),
      detail: approvalGap >= 0 ? "Pending approval value" : "Approved exceeds submitted",
      accent: theme.accentWarm,
      tone: "Attention",
      progress: submittedRevenue ? Math.min(Math.abs(approvalGap / submittedRevenue) * 100, 100) : 0,
    },
    {
      label: "Peak Period",
      caption: "Highest spend in selected view",
      value: highestPeriod ? formatCurrency(highestPeriod.amount) : "$0.00",
      detail: highestPeriod?.label ?? "No period available",
      accent: "#7c3aed",
      tone: "Peak",
      progress: visibleTotal ? Math.min(((highestPeriod?.amount ?? 0) / visibleTotal) * 100, 100) : 0,
    },
    {
      label: "Period Average",
      caption: "Mean spend per period",
      value: formatCurrency(averagePeriod),
      detail: `${periodTotals.length.toLocaleString()} ${periodView} periods analyzed`,
      accent: "#0e7490",
      tone: "Average",
      progress: highestPeriod?.amount ? Math.min((averagePeriod / highestPeriod.amount) * 100, 100) : 0,
    },
  ];
  const overviewPeriodTotals = aggregateByPeriod(filteredData, overviewPeriodView);
  const chartPeriods = overviewPeriodTotals.slice(-8);
  const maxChartPeriodAmount = Math.max(...chartPeriods.map((item) => Math.abs(item.amount)), 0);
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

  if (isLoading) {
    return loadingView;
  }

  return (
    <div style={{ minHeight: "100vh", padding: "28px 24px 40px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 1280, margin: "0 auto", color: theme.text, backgroundColor: theme.pageBg }}>
      {showWelcome && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: themeMode === "light" ? "rgba(15, 23, 42, 0.42)" : "rgba(2, 6, 23, 0.68)" }}>
          <div style={{ width: "min(620px, 100%)", overflow: "hidden", borderRadius: 8, background: theme.panelBg, border: `1px solid ${theme.border}`, boxShadow: "0 24px 70px rgba(15,23,42,0.28)" }}>
            <div style={{ padding: 22, color: "#fff", background: "linear-gradient(135deg, #0f766e, #12324f)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.82, textTransform: "uppercase" }}>Welcome to IGCC Commercial Dashboard</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, 0.75fr)", gap: 18, alignItems: "stretch", marginBottom: 18 }}>
        <div style={{ position: "relative", overflow: "hidden", background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 24, boxShadow: theme.cardShadow }}>
          <div style={{ position: "absolute", inset: "0 0 auto", height: 5, background: "linear-gradient(90deg, #0f766e, #7c3aed, #b45309)" }} />
          <p style={{ margin: "0 0 8px", color: theme.accentStrong, fontSize: 12, fontWeight: 900, letterSpacing: 0, textTransform: "uppercase" }}>Commercial Command Center</p>
          <h1 style={{ margin: 0, fontSize: 40, letterSpacing: 0, lineHeight: 1.05, fontWeight: 950, color: theme.text }}>IRAQ GATE CONTRACTING COMPANY</h1>
          <p style={{ margin: "10px 0 0", color: theme.subtext, fontSize: 16, maxWidth: 760 }}>Executive cost, AFP revenue, portfolio recovery, and hub performance dashboard for IGCC Level 1.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
            {portfolioSummaries.map((portfolio) => (
              <span key={portfolio.label} style={{ color: portfolio.accent, background: portfolio.soft, border: `1px solid ${portfolio.accent}33`, borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 900 }}>
                {portfolio.label}
              </span>
            ))}
          </div>
        </div>
        <div style={{ background: theme.accent, color: "#fff", borderRadius: 8, padding: 20, boxShadow: theme.cardShadow }}>
          <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.78, textTransform: "uppercase" }}>Data Sources</div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Cost report</div>
              <div style={{ marginTop: 3, fontWeight: 850, overflowWrap: "anywhere" }}>{filename || "No cost file loaded"}</div>
            </div>
            <div>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Revenue report</div>
              <div style={{ marginTop: 3, fontWeight: 850, overflowWrap: "anywhere" }}>{revenueFilename || "No revenue file loaded"}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.18)" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>{data.length.toLocaleString()}</div>
              <div style={{ opacity: 0.78, fontSize: 12 }}>Cost rows</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 950 }}>{yearsLoaded.length || 0}</div>
              <div style={{ opacity: 0.78, fontSize: 12 }}>Years loaded</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap", background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 14, boxShadow: theme.cardShadow }}>
        <div style={{ display: "inline-flex", gap: 4, padding: 4, background: theme.accentSoft, borderRadius: 8, flexWrap: "wrap" }}>
          {NAV_ITEMS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActivePage(value)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "9px 14px",
                cursor: "pointer",
                fontWeight: 800,
                background: activePage === value ? theme.panelBg : "transparent",
                color: activePage === value ? theme.accentStrong : theme.text,
                boxShadow: activePage === value ? "0 1px 4px rgba(15,23,42,0.12)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {VIEW_ONLY_MODE && (
          <span style={{ color: theme.accentStrong, background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
            View-only access
          </span>
        )}
        <button
          type="button"
          onClick={openWelcome}
          style={{
            padding: "10px 16px",
            cursor: "pointer",
            backgroundColor: theme.inputBg,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            fontWeight: 850,
          }}
        >
          Welcome
        </button>
        {!VIEW_ONLY_MODE && (
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ padding: 10, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.panelBg, color: theme.text }} />
        )}
        {!VIEW_ONLY_MODE && filename && <span style={{ color: theme.subtext, minWidth: 200, textAlign: "center", display: "inline-block" }}>{filename}</span>}
        <select value={selectedCostCenter} onChange={handleCostCenterSelect} style={{ padding: 10, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.panelBg, color: theme.text }}>
          <option value="">{IGCC_LEVEL_LABEL} - all hubs</option>
          {COST_CENTER_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.centers.map((center) => (
                <option key={center} value={center}>{center}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
            backgroundColor: theme.panelBg,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            boxShadow: themeMode === "light" ? "0 4px 8px rgba(31,53,85,0.08)" : "0 4px 8px rgba(0,0,0,0.2)",
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

      {activePage === "overview" && (
        <div style={{ marginBottom: 18, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 18, boxShadow: theme.cardShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: theme.text, fontSize: 22, fontWeight: 950, letterSpacing: 0 }}>Overview Analytics</h2>
              <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Visual commercial summary for spend, AFP revenue, portfolio recovery, and period trends.</p>
            </div>
            {renderPeriodToggleFor(overviewPeriodView, setOverviewPeriodView)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 280px), 0.85fr) minmax(min(100%, 520px), 1.65fr)", gap: 14, marginBottom: 14 }}>
            <div style={{ border: `1px solid ${commercialHealth.color}55`, borderLeft: `6px solid ${commercialHealth.color}`, borderRadius: 8, padding: 16, background: theme.panelBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ color: theme.subtext, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>CEO Attention</div>
                <span style={{ color: commercialHealth.color, background: themeMode === "light" ? `${commercialHealth.color}16` : "rgba(255,255,255,0.08)", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 950 }}>{commercialHealth.label}</span>
              </div>
              <div style={{ marginTop: 12, color: theme.text, fontSize: 20, fontWeight: 950 }}>{formatCurrency(revenueSurplus)}</div>
              <p style={{ margin: "8px 0 0", color: theme.subtext, fontSize: 13, lineHeight: 1.45 }}>{commercialHealth.message}</p>
              <p style={{ margin: "12px 0 0", color: theme.text, fontSize: 13, lineHeight: 1.45, fontWeight: 750 }}>{executiveInsight}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
              {[
                ["Best Portfolio", bestPortfolio?.label ?? "N/A", bestPortfolio ? formatPercent(bestPortfolio.recovery) : "0.0%", bestPortfolio?.accent ?? theme.accentStrong],
                ["Weakest Portfolio", weakestPortfolio?.label ?? "N/A", weakestPortfolio ? formatPercent(weakestPortfolio.recovery) : "0.0%", weakestPortfolio?.accent ?? theme.danger],
                ["Highest Spend Hub", highestSpendHub?.label ?? "N/A", highestSpendHub ? formatCurrency(highestSpendHub.amount) : "$0.00", theme.accentWarm],
                ["Approval Gap", largestApprovalGapHub?.label ?? "No gap", largestApprovalGapHub ? formatCurrency(largestApprovalGapHub.approvalGap) : "$0.00", "#2563eb"],
                ["Lowest Recovery", lowestRecoveryHub?.label ?? "N/A", lowestRecoveryHub ? formatPercent(lowestRecoveryHub.recovery) : "0.0%", theme.danger],
              ].map(([label, value, detail, accent]) => (
                <div key={label} style={{ border: `1px solid ${theme.border}`, borderTop: `4px solid ${accent}`, borderRadius: 8, padding: 13, background: theme.inputBg }}>
                  <div style={{ color: theme.subtext, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 8, color: theme.text, fontSize: 16, fontWeight: 950, lineHeight: 1.1 }}>{value}</div>
                  <div style={{ marginTop: 7, color: theme.subtext, fontSize: 12, fontWeight: 800 }}>{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 420px), 1.25fr) minmax(min(100%, 300px), 0.75fr)", gap: 14, marginBottom: 14 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Accumulated Cost by Hub</h3>
                  <p style={{ margin: "4px 0 0", color: theme.subtext, fontSize: 12 }}>Histogram of selected cost accumulated by hub</p>
                </div>
                <strong style={{ color: theme.text }}>{formatCurrency(visibleTotal)}</strong>
              </div>
              <div style={{ display: "grid", gap: 10, minHeight: 210, alignContent: "center" }}>
                {hubHistogramRows.map((hub) => {
                  const section = HUB_SECTIONS.find((item) => item.hubs.includes(hub.label));
                  const accent = section?.accent ?? theme.accentStrong;
                  const width = `${Math.max(3, (Math.abs(hub.amount) / (maxHubHistogramAmount || 1)) * 100)}%`;

                  return (
                    <div key={hub.label} style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr) 135px", gap: 10, alignItems: "center" }}>
                      <span style={{ color: theme.text, fontSize: 12, fontWeight: 900 }}>{hub.label}</span>
                      <div style={{ height: 18, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", borderRadius: 999, background: accent }} />
                      </div>
                      <span style={{ color: theme.text, fontSize: 12, fontWeight: 900, textAlign: "right" }}>{formatCurrency(hub.amount)}</span>
                    </div>
                  );
                })}
                {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub cost data matches the current filters.</div>}
              </div>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Commercial Mix</h3>
              <p style={{ margin: "4px 0 12px", color: theme.subtext, fontSize: 12 }}>Approved AFP against submitted AFP</p>
              <div style={{ display: "grid", placeItems: "center" }}>
                <svg viewBox="0 0 150 150" role="img" aria-label="Commercial mix donut chart" style={{ width: 190, maxWidth: "100%" }}>
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
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Portfolio Recovery</h3>
              <p style={{ margin: "4px 0 14px", color: theme.subtext, fontSize: 12 }}>Approved revenue compared with cost by portfolio</p>
              <div style={{ display: "grid", gap: 12 }}>
                {portfolioSummaries.map((portfolio) => (
                  <div key={portfolio.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: theme.text, fontSize: 13, fontWeight: 850, marginBottom: 6 }}>
                      <span style={{ color: portfolio.accent }}>{portfolio.label}</span>
                      <span>{formatPercent(portfolio.recovery)}</span>
                    </div>
                    <div style={{ display: "grid", gap: 5 }}>
                      <div style={{ height: 8, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(3, (portfolio.cost / (maxPortfolioCost || 1)) * 100)}%`, height: "100%", background: portfolio.accent, borderRadius: 999 }} />
                      </div>
                      <div style={{ color: theme.subtext, fontSize: 12 }}>{formatCurrency(portfolio.cost)} cost | {formatCurrency(portfolio.approved)} approved</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, background: theme.inputBg }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 950 }}>Spend by Period</h3>
              <p style={{ margin: "4px 0 14px", color: theme.subtext, fontSize: 12 }}>Cost distribution by {overviewPeriodView} view</p>
              <div style={{ display: "grid", gap: 10 }}>
                {chartPeriods.map((period) => (
                  <div key={period.key} style={{ display: "grid", gridTemplateColumns: "78px minmax(0, 1fr) 118px", gap: 10, alignItems: "center" }}>
                    <span style={{ color: theme.text, fontSize: 12, fontWeight: 850 }}>{period.label}</span>
                    <div style={{ height: 10, borderRadius: 999, background: theme.accentSoft, overflow: "hidden" }}>
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

      {activePage !== "overview" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20, backgroundColor: theme.panelBg, padding: 18, borderRadius: 8, border: `1px solid ${theme.border}`, boxShadow: theme.cardShadow }}>
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, color: theme.text, fontSize: 18, letterSpacing: 0 }}>Analysis Filters</h2>
            <p style={{ margin: "4px 0 0", color: theme.subtext, fontSize: 13 }}>Filter cost and revenue together by cost center or period.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilters({ costCenter: "", month: "" });
              setSelectedCostCenter("");
            }}
            style={{ padding: "9px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text, cursor: "pointer", fontWeight: 700 }}
          >
            Clear Filters
          </button>
        </div>
        <label style={{ display: "block", color: theme.text, fontWeight: 600, fontSize: 14 }}>
          Filter Cost Center
          <select
            value={filters.costCenter}
            onChange={handleFilterChange("costCenter")}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, marginTop: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}
          >
            <option value="">{IGCC_LEVEL_LABEL} - all hubs and cost centers</option>
            {COST_CENTER_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.centers.map((center) => (
                  <option key={center} value={center}>{center}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label style={{ display: "block", color: theme.text, fontWeight: 600, fontSize: 14 }}>
          Filter Month
          <select
            value={filters.month}
            onChange={handleFilterChange("month")}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, marginTop: 8, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text }}
          >
            <option value="">All months</option>
            {monthOptions.map((month) => (
              <option key={month.label} value={month.label}>{month.label}</option>
            ))}
          </select>
        </label>
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
                      <span style={{ textAlign: "right", color: theme.subtext }}>{portfolioRows} rows</span>
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
                              <span style={{ textAlign: "right", color: theme.subtext }}>{hubRowsCount} rows</span>
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
                                    <th style={tableHeaderStyle}>Rows</th>
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
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Cost-only analysis by period and hub, separated from commercial revenue performance.</p>
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
                  {!periodTotals.length && <div style={{ color: theme.subtext }}>No cost data matches the current filters.</div>}
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
                  {!hubHistogramRows.length && <div style={{ color: theme.subtext }}>No hub cost data matches the current filters.</div>}
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
                ["Approved Revenue", formatCurrency(detailApprovedRevenue), `${detailFilteredRevenueRows.filter((item) => item.status === "approved").length.toLocaleString()} approved entries`, "#059669"],
                ["Submitted Revenue", formatCurrency(detailSubmittedRevenue), `${detailFilteredRevenueRows.filter((item) => item.status === "submitted").length.toLocaleString()} submitted entries`, "#2563eb"],
                ["Spent Cost", formatCurrency(detailCostTotal), `${detailFilteredCostRows.length.toLocaleString()} cost transactions`, theme.accentWarm],
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
                <h2 style={{ margin: 0, color: theme.text, fontSize: 22, letterSpacing: 0 }}>Spent Detail by Category</h2>
                <p style={{ margin: "5px 0 0", color: theme.subtext, fontSize: 13 }}>Cost categories from the master spent report for the selected cost center.</p>
              </div>
              <div style={{ color: theme.subtext, fontSize: 14 }}>{detailCategoryRows.length.toLocaleString()} categories with spend</div>
            </summary>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={leftHeaderStyle}>Cost Category</th>
                    <th style={tableHeaderStyle}>Spent Cost</th>
                    <th style={tableHeaderStyle}>Share of Cost</th>
                    <th style={tableHeaderStyle}>Transactions</th>
                    <th style={leftHeaderStyle}>Cost Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {detailCategoryRows.map((row) => {
                    const share = detailCostTotal ? row.amount / detailCostTotal : 0;
                    const width = detailMaxCategoryAmount ? `${Math.max(3, (Math.abs(row.amount) / detailMaxCategoryAmount) * 100)}%` : "0%";

                    return (
                      <tr key={row.category}>
                        <td style={leftCellStyle}>{row.category}</td>
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
                  {!detailCategoryRows.length && (
                    <tr>
                      <td colSpan={5} style={{ ...leftCellStyle, color: theme.subtext }}>No spent detail found for this cost center and current month filter.</td>
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

      {activePage === "income" && (
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
