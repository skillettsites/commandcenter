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
  sedol: string; // SEDOL identifier for HL lookups
  yahooSymbol: string; // Yahoo Finance ticker for live price lookup
  units: number; // estimated units held
  currentValue: number; // GBP fallback if live price unavailable
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

export interface DividendSchedule {
  holdingId: string; // matches stock symbol or fund id
  holdingName: string;
  holdingType: 'stock' | 'fund';
  annualYieldPercent: number; // estimated annual yield
  frequency: 'monthly' | 'quarterly' | 'none';
  paysDividend: boolean;
  // For known payment months (1-12). Monthly = all months, quarterly = specific months
  paymentMonths: number[];
}

export const stockHoldings: StockHolding[] = [
  { symbol: 'NVDA', name: 'NVIDIA', shares: 320, costBasis: 3281, account: 'ISA', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet/Google', shares: 108, costBasis: 8150, account: 'ISA', currency: 'USD' },
  { symbol: 'JEPQ', name: 'JEPQ', shares: 41, costBasis: 813, account: 'ISA', currency: 'USD' },
  { symbol: 'PLTR', name: 'Palantir', shares: 247, costBasis: 4463, account: 'F&S', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla', shares: 62, costBasis: 15089, account: 'F&S', currency: 'USD' },
];

export const fundHoldings: FundHolding[] = [
  {
    id: 'fidelity-enhanced',
    name: 'Fidelity Enhanced Income',
    sedol: 'BD1NLK5',
    yahooSymbol: '0P0000XMHQ.L',
    units: 61871.64,
    currentValue: 55034,
    costBasis: 48076,
    account: 'ISA',
  },
  {
    id: 'ubs-global',
    name: 'UBS Global Enhanced Eq Income',
    sedol: 'B3LBSQ4',
    yahooSymbol: '0P00012V5G.L',
    units: 118798.032,
    currentValue: 42114,
    costBasis: 38221,
    account: 'ISA',
  },
  {
    id: 'aegon-high-yield',
    name: 'Aegon High Yield Bond',
    sedol: 'B1FQYP9',
    yahooSymbol: '0P0000HDPV.L',
    units: 10848.34,
    currentValue: 9905,
    costBasis: 9961,
    account: 'ISA',
  },
  {
    id: 'schroder-high-yield',
    name: 'Schroder High Yield Opps',
    sedol: '',
    yahooSymbol: '',
    units: 2596.55,
    currentValue: 1222,
    costBasis: 1222,
    account: 'ISA',
  },
];

export const cashInvestmentAccounts: CashHolding[] = [
  { account: 'ISA Cash', balance: 73240 },
  { account: 'F&S Cash', balance: 132 },
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

// Dividend/income schedules for all holdings
export const dividendSchedules: DividendSchedule[] = [
  {
    holdingId: 'fidelity-enhanced',
    holdingName: 'Fidelity Enhanced Income',
    holdingType: 'fund',
    annualYieldPercent: 7.54, // Trustnet verified 21 Mar 2026
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    holdingId: 'ubs-global',
    holdingName: 'UBS Global Enhanced Eq Income',
    holdingType: 'fund',
    annualYieldPercent: 7.2, // HL factsheet verified 21 Mar 2026
    frequency: 'quarterly',
    paysDividend: true,
    paymentMonths: [3, 6, 9, 12], // Mar, Jun, Sep, Dec
  },
  {
    holdingId: 'aegon-high-yield',
    holdingName: 'Aegon High Yield Bond',
    holdingType: 'fund',
    annualYieldPercent: 7.27, // AI scraped from Trustnet, verified 21 Mar 2026
    frequency: 'monthly', // actually pays monthly per Trustnet data
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    holdingId: 'NVDA',
    holdingName: 'NVIDIA',
    holdingType: 'stock',
    annualYieldPercent: 0.03,
    frequency: 'quarterly',
    paysDividend: true,
    paymentMonths: [1, 4, 7, 10], // Jan, Apr, Jul, Oct
  },
  {
    holdingId: 'GOOGL',
    holdingName: 'Alphabet/Google',
    holdingType: 'stock',
    annualYieldPercent: 0,
    frequency: 'none',
    paysDividend: false,
    paymentMonths: [],
  },
  {
    holdingId: 'JEPQ',
    holdingName: 'JEPQ',
    holdingType: 'stock',
    annualYieldPercent: 10.0,
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    holdingId: 'PLTR',
    holdingName: 'Palantir',
    holdingType: 'stock',
    annualYieldPercent: 0,
    frequency: 'none',
    paysDividend: false,
    paymentMonths: [],
  },
  {
    holdingId: 'TSLA',
    holdingName: 'Tesla',
    holdingType: 'stock',
    annualYieldPercent: 0,
    frequency: 'none',
    paysDividend: false,
    paymentMonths: [],
  },
];

// JEPQ target: future income target after selling growth stocks + properties
export const jepqTarget = {
  name: 'JEPQ (target)',
  estimatedDeployableCapital: 500000, // approximate target investment
  annualYieldPercent: 10,
  frequency: 'monthly' as const,
  estimatedMonthlyIncome: (500000 * 0.10) / 12, // ~£4,167/mo
};
