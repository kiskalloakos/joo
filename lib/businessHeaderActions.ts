let addIncome: (() => void) | null = null;

export function registerBusinessHeaderAction(action: () => void): () => void {
  addIncome = action;
  return () => {
    if (addIncome === action) addIncome = null;
  };
}

export function triggerBusinessHeaderAction(): void {
  addIncome?.();
}
