let addIncome: (() => void) | null = null;

export function registerRevenueHeaderAction(action: () => void): () => void {
  addIncome = action;
  return () => {
    if (addIncome === action) addIncome = null;
  };
}

export function triggerRevenueHeaderAction(): void {
  addIncome?.();
}
