import { useEffect, useMemo, useState } from "react";

import financialInputsData from "../data/financialInputsData.json";
import { fetchAfpRecords } from "../services/afp/afpRepository";
import { mergeFinancialInputsWithAfpMaster } from "../services/afp/afpFinancialEntries";

const DEFAULT_COMPARISON = {
  startYear: import.meta.env.VITE_AFP_MASTER_START_YEAR || "2026",
  legacySubmitted: 0,
  legacyApproved: 0,
  masterSubmitted: 0,
  masterApproved: 0,
  submittedDifference: 0,
  approvedDifference: 0,
  replacedLegacyRows: 0,
  masterRows: 0,
};

export function useAfpFinancialInputs() {
  const [afpRecords, setAfpRecords] = useState([]);
  const [isLoadingAfpMaster, setIsLoadingAfpMaster] = useState(true);
  const [afpMasterError, setAfpMasterError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoadingAfpMaster(true);
    setAfpMasterError("");

    fetchAfpRecords()
      .then((records) => {
        if (isMounted) setAfpRecords(records);
      })
      .catch((error) => {
        if (isMounted) setAfpMasterError(error.message || "Unable to load AFP_MASTER.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingAfpMaster(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const merged = useMemo(() => (
    !isLoadingAfpMaster && !afpMasterError
      ? mergeFinancialInputsWithAfpMaster(financialInputsData.entries || [], afpRecords)
      : { entries: financialInputsData.entries || [], comparison: DEFAULT_COMPARISON }
  ), [afpMasterError, afpRecords, isLoadingAfpMaster]);

  return {
    entries: merged.entries,
    afpMasterComparison: merged.comparison,
    afpRecords,
    isLoadingAfpMaster,
    afpMasterError,
  };
}
