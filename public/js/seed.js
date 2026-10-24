// First-launch data: a few starter categories and nothing personal. Your own accounts,
// bills and income come from a backup file (Backup and settings › Restore) or from Edit.
export function seed() {
  return {
    "fin.accounts": [],
    "fin.income": [],
    "fin.categories": [
      { id: "c1", name: "Living", plan: 0, meta: "", c: "#4C6EF5" },
      { id: "c2", name: "Food", plan: 0, meta: "", c: "#E8833A" },
      { id: "c3", name: "Car", plan: 0, meta: "", c: "#D6453D" },
      { id: "c4", name: "Subscriptions", plan: 0, meta: "", c: "#2F9E77" },
      { id: "c5", name: "Other / one-off", plan: 0, meta: "", c: "#a3a3a8" },
    ],
    "fin.bills": [],
    "fin.months": {},
    "fin.ledger": { people: [], entries: [] },
    "fin.goals": [],
    "fin.settings": { taxRules: "current" },
  };
}
