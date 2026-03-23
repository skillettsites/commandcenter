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
  autoValue?: boolean;
  address?: string;
  postcode?: string;
  premium?: 'upper' | 'mid' | 'lower';
  premiumNotes?: string;
  rentalIncome?: number; // monthly rental income
  mortgagePayment?: number; // monthly mortgage payment
  serviceCharge?: number; // monthly service charge + ground rent
}

export interface CashHolding {
  account: string;
  balance: number;
}

export interface UpcomingMoney {
  id: string;
  source: string;
  amount: number;
  notes: string;
  status: 'confirmed' | 'expected' | 'pending';
}

export const upcomingMoney: UpcomingMoney[] = [
  { id: 'sister-loan', source: 'Sister (loan repayment)', amount: 40000, notes: 'Owed to me', status: 'confirmed' },
  { id: 'mum-probate', source: 'Mum (probate)', amount: 100000, notes: 'From estate', status: 'expected' },
  { id: 'house-sale-mine', source: 'House sale (my share)', amount: 300000, notes: 'When mum sells house', status: 'pending' },
  { id: 'house-sale-sister', source: 'Sister (from house sale)', amount: 100000, notes: 'Sister giving her share', status: 'pending' },
];

export interface CryptoHolding {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  exchange: string;
}

// TBC - user to confirm holdings on OKX
export const cryptoHoldings: CryptoHolding[] = [];

export interface PokemonCard {
  id: string;
  name: string;
  number: string;
  set: string;
  grade: string; // PSA grade
  value: number; // current value in USD
  cost: number; // purchase cost in USD
}

export const pokemonCards: PokemonCard[] = [
  { id: 'charizard-4', name: 'Charizard', number: '#4', set: 'Base Set Shadowless', grade: 'PSA 8', value: 4255, cost: 1800 },
  { id: 'blastoise-2', name: 'Blastoise', number: '#2', set: 'Base Set Shadowless', grade: 'PSA 9', value: 2497, cost: 950 },
  { id: 'venusaur-15', name: 'Venusaur', number: '#15', set: 'Base Set Shadowless', grade: 'PSA 9', value: 1598, cost: 820 },
  { id: 'squirtle-63', name: 'Squirtle', number: '#63', set: 'Base Set Shadowless', grade: 'PSA 10', value: 860, cost: 130 },
  { id: 'bulbasaur-44', name: 'Bulbasaur', number: '#44', set: 'Base Set Shadowless', grade: 'PSA 9', value: 497, cost: 130 },
  { id: 'charmander-46', name: 'Charmander', number: '#46', set: 'Base Set Shadowless', grade: 'PSA 10', value: 400, cost: 130 },
  { id: 'wartortle-42', name: 'Wartortle', number: '#42', set: 'Base Set Shadowless', grade: 'PSA 10', value: 360, cost: 130 },
  { id: 'charmeleon-24', name: 'Charmeleon', number: '#24', set: 'Base Set Shadowless', grade: 'PSA 10', value: 331, cost: 130 },
  { id: 'ivysaur-30', name: 'Ivysaur', number: '#30', set: 'Base Set Shadowless', grade: 'PSA 10', value: 322, cost: 130 },
  { id: 'mewtwo-v-72', name: 'Mewtwo V', number: '#72', set: 'Pokemon Go', grade: 'Ungraded', value: 50, cost: 0 },
];

export interface DividendSchedule {
  holdingId: string; // matches stock symbol or fund id
  holdingName: string;
  holdingType: 'stock' | 'fund';
  annualYieldPercent: number; // estimated annual yield
  frequency: 'monthly' | 'quarterly' | 'none';
  paysDividend: boolean;
  // For known payment months (1-12). Monthly = all months, quarterly = specific months
  paymentMonths: number[];
  // Approximate payment day of month (based on historical patterns)
  expectedPayDay?: number;
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
  { account: 'ISA Cash', balance: 72386 },
  { account: 'F&S Cash', balance: 19832 },
];

// E*Trade ICE holdings - live priced via Yahoo Finance (symbol: ICE)
// Share counts derived from E*Trade USD values / ICE price as at 21 Mar 2026
export const etradeHoldings = {
  symbol: 'ICE',
  name: 'ICE (Intercontinental Exchange)',
  esppValueUSD: 166193, // Employee Stock Purchase Plan (vested)
  rsValueUSD: 71457, // Restricted Stock (unvested)
  totalValueUSD: 237650,
  // Share counts for live price tracking
  vestedShares: 1049, // ESPP
  unvestedShares: 451, // RS
  totalShares: 1500,
  account: 'E*Trade' as const,
  currency: 'USD' as const,
};
// Fallback GBP value if Yahoo Finance unavailable
export const etradeValue = 134202; // vested only, as at 21 Mar 2026

export const propertyHoldings: PropertyHolding[] = [
  {
    id: 'binnacle',
    name: '604 Binnacle House',
    value: 470000,
    mortgage: 270000,
    type: 'keeping',
    autoValue: true,
    address: '604 Binnacle House, 10 Cobblestone Square, London E1W 3AR',
    postcode: 'E1W 3AR',
    premium: 'upper',
    premiumNotes: 'Studio with massive terrace, south-facing, top floor, premium building',
  },
  {
    id: 'cordage',
    name: '505 Cordage',
    value: 350000,
    mortgage: 255000,
    type: 'keeping',
    autoValue: true,
    address: '505 Cordage House, 21 Cobblestone Square, London E1W 3AQ',
    postcode: 'E1W 3AS',
    premium: 'upper',
    premiumNotes: 'Studio, high floor, nice view',
    rentalIncome: 1835,
    mortgagePayment: 1293.50,
    serviceCharge: 250,
  },
  { id: 'didcot', name: '9 Fen Violet, Didcot', value: 425000, mortgage: 268270, type: 'selling' },
  { id: 'newbury', name: '6 Hennessey, Newbury', value: 500000, mortgage: 342248, type: 'selling' },
  { id: 'shoeburyness', name: 'Flat 5 Sandpipers, Shoeburyness', value: 350000, mortgage: 213503, type: 'selling' },
];

export const cashHoldings: CashHolding[] = [
  { account: 'NatWest 3775', balance: 32949 },
  { account: 'NatWest 8002', balance: 2154 },
  { account: 'Revolut', balance: 1941 },
  { account: 'Premium Bonds', balance: 26000 },
  { account: 'DRS Real Estate Ltd', balance: 19489 },
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
    expectedPayDay: 25, // typically pays around 25th each month
  },
  {
    holdingId: 'ubs-global',
    holdingName: 'UBS Global Enhanced Eq Income',
    holdingType: 'fund',
    annualYieldPercent: 7.2, // HL factsheet verified 21 Mar 2026
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    expectedPayDay: 28, // typically end of month
  },
  {
    holdingId: 'aegon-high-yield',
    holdingName: 'Aegon High Yield Bond',
    holdingType: 'fund',
    annualYieldPercent: 7.27, // AI scraped from Trustnet, verified 21 Mar 2026
    frequency: 'monthly', // actually pays monthly per Trustnet data
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    expectedPayDay: 14, // typically mid-month
  },
  {
    holdingId: 'NVDA',
    holdingName: 'NVIDIA',
    holdingType: 'stock',
    annualYieldPercent: 0.03,
    frequency: 'quarterly',
    paysDividend: true,
    paymentMonths: [1, 4, 7, 10], // Jan, Apr, Jul, Oct
    expectedPayDay: 27, // typically late month
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
    expectedPayDay: 7, // typically first week of month
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
