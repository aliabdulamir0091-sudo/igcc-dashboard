export const FIRESTORE_COLLECTIONS = {
  costCenters: "costCenters",
  afp: "afp",
  costs: "costs",
  creditNotes: "creditNotes",
  users: "users",
};

export const DATA_SCHEMAS = [
  {
    collection: FIRESTORE_COLLECTIONS.costCenters,
    purpose: "Portfolio, hub, and cost center hierarchy.",
  },
  {
    collection: FIRESTORE_COLLECTIONS.afp,
    purpose: "Submitted and approved AFP commercial values.",
  },
  {
    collection: FIRESTORE_COLLECTIONS.costs,
    purpose: "GL-based cost transactions and summaries.",
  },
  {
    collection: FIRESTORE_COLLECTIONS.creditNotes,
    purpose: "CN received, issued, and adjustment records.",
  },
  {
    collection: FIRESTORE_COLLECTIONS.users,
    purpose: "User profile, role, and preferences.",
  },
];
