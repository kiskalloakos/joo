type MoneyAction = () => void;

let addMoney: MoneyAction | null = null;
let removeMoney: MoneyAction | null = null;

export function registerHomeHeaderActions(actions: {
  add: MoneyAction;
  remove: MoneyAction;
}): () => void {
  addMoney = actions.add;
  removeMoney = actions.remove;
  return () => {
    if (addMoney === actions.add) addMoney = null;
    if (removeMoney === actions.remove) removeMoney = null;
  };
}

export function triggerHomeMoneyAction(mode: 'add' | 'remove'): void {
  if (mode === 'add') addMoney?.();
  else removeMoney?.();
}
