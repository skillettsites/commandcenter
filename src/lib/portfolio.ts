// Portfolio configuration - update values here when data changes
// Last manual update: 2026-03-21

export interface StockHolding {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number; // total cost in GBP
  account: 'ISA' | 'F&S' | 'E*Trade';
  currency: 'USD' | 'GBP';
}

export interface FundHolding {
  id: string;
  name: string;
  currentValue: number; // GBP
  costBasis: number; // GBP
  account: 'ISA' | 'F&S';
}

export interface PropertyHolding {
  id: string;
  name: string;
  value: number;
  mortgage: number;
  type: 'keeping' | 'selling';
}

export interface CashHolding {
  account: string;
  balance: number;
}

export const stockHoldings: StockHolding[] = [
  { symbol: 'NVDA', name: 'NVIDIA', shares: 320, costBasis: 3281, account: 'ISA', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet/Google', shares: 108, costBasis: 8150, account: 'ISA', currency: 'USD' },
  { symbol: 'PLTR', name: 'Palantir', shares: 247, costBasis: 4463, account: 'F&S', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla', shares: 62, costBasis: 15089, account: 'F&S', currency: 'USD' },
];

export const fundHoldings: FundHolding[] = [
  { id: 'fidelity-enhanced', name: 'Fidelity Enhanced Income', currentValue: 55034, costBasis: 50000, account: 'ISA' },
  { id: 'ubs-global', name: 'UBS Global Enhanced Eq Income', currentValue: 42114, costBasis: 40000, account: 'ISA' },
  { id: 'aegon-high-yield', name: 'Aegon High Yield Bond', currentValue: 9905, costBasis: 10000, account: 'ISA' },
];

export const cashInvestmentAccounts: CashHolding[] = [
  { account: 'ISA Cash', balance: 73240 },
  { account: 'F&S Cash', balance: 134 },
];

export const etradeValue = 148433; // RSUs, manually updated

export const propertyHoldings: PropertyHolding[] = [
  { id: 'binnacle', name: '604 Binnacle House', value: 500000, mortgage: 270000, type: 'keeping' },
  { id: 'cordage', name: '505 Cordage', value: 350000, mortgage: 165000, type: 'keeping' },
  { id: 'didcot', name: 'Didcot', value: 170000, mortgage: 0, type: 'selling' },
  { id: 'newbury', name: 'Newbury', value: 195000, mortgage: 0, type: 'selling' },
  { id: 'shoeburyness', name: 'Shoeburyness', value: 142000, mortgage: 0, type: 'selling' },
];

export const cashHoldings: CashHolding[] = [
  { account: 'NatWest 3775', balance: 52649 },
  { account: 'NatWest 8002', balance: 2154 },
  { account: 'Revolut', balance: 1941 },
  { account: 'Premium Bonds', balance: 26000 },
];
