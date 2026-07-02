// Portfolio configuration - update values here when data changes
// Last manual update: 2026-07-02 (from HL + E*Trade app screenshots)
// HL total £400,272.40 (invested £360,360.68, cash £39,911.72; +£126,211.57 / +53.90% all-time; +£850.79 today).
// ISA £298,496.91 (+52.77%, cash £2.87). Fund & Share £101,775.49 (+59.54%, cash £39,089.22). FX 1.33387 USD/GBP (HL app, 02 Jul).
// Changes vs 15 Jun: ISA GOOGL 198->275 sh (cost ->£33,477.91); Fidelity units 108,130.87->85,205.61 (cost ->£68,780.37); added ISA SpaceX 69 sh (£7,962.29); ISA cash ->£2.87; F&S cash ->£39,089.22.
// E*Trade (ICE) 02 Jul: ESPP (vested) $145,612.77, RS (unvested) $57,446.24 at $126.73 -> vested ~1,149 sh, unvested ~453 sh.

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
  // Mum (probate) £100k RECEIVED 31 May 2026 — now in cash (NatWest), removed from upcoming
  { id: 'sister-loan', source: 'Sister (loan repayment)', amount: 40000, notes: 'Owed to me', status: 'confirmed' },
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
  // ISA holdings
  { symbol: 'GOOGL', name: 'Alphabet/Google', shares: 275, costBasis: 33477.91, account: 'ISA', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon', shares: 143, costBasis: 22338.02, account: 'ISA', currency: 'USD' },
  { symbol: 'JEQP.L', name: 'JEPQ (Nasdaq Equity Premium Income)', shares: 564, costBasis: 10800.38, account: 'ISA', currency: 'GBP' },
  { symbol: 'NVDA', name: 'NVIDIA', shares: 320, costBasis: 3281.38, account: 'ISA', currency: 'USD' },
  { symbol: 'SPCX', name: 'SpaceX', shares: 69, costBasis: 7962.29, account: 'ISA', currency: 'USD' },
  // 2x Tesla ETP (2TSL) sold — no longer in the ISA (absent from the 02 Jul holdings list; its ~£17k would rank near the top if held).
  // Fund & Share holdings (updated 12 Jun 2026 from HL app)
  { symbol: 'PLTR', name: 'Palantir', shares: 247, costBasis: 4462.60, account: 'F&S', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla', shares: 62, costBasis: 15088.75, account: 'F&S', currency: 'USD' },
  { symbol: 'SPCX', name: 'SpaceX', shares: 84, costBasis: 9952.87, account: 'F&S', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet/Google', shares: 37, costBasis: 9746.10, account: 'F&S', currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA', shares: 65, costBasis: 9993.09, account: 'F&S', currency: 'USD' },
];

export const fundHoldings: FundHolding[] = [
  {
    id: 'fidelity-enhanced',
    name: 'Fidelity Enhanced Income',
    sedol: 'BYSYZP1',
    yahooSymbol: '0P0000XMHQ.L',
    units: 85205.61,
    currentValue: 76150, // fallback; live value via HL unit-price cache. Units reduced 02 Jul 2026 (108,130.87 -> 85,205.61)
    costBasis: 68780.37,
    account: 'ISA',
  },
  {
    id: 'ubs-global',
    name: 'UBS Global Enhanced Eq Income',
    sedol: 'BL0RSP8',
    yahooSymbol: '0P00012V5G.L',
    units: 147233.897,
    currentValue: 53902, // fallback; live value via HL unit-price cache. Reconciled 15 Jun 2026 (ISA £302,206, F&S £104,810, HL total £407,017)
    costBasis: 48218.22,
    account: 'ISA',
  },
];

export const cashInvestmentAccounts: CashHolding[] = [
  { account: 'ISA Cash', balance: 2.87 },       // 02 Jul 2026
  { account: 'F&S Cash', balance: 39089.22 },   // 02 Jul 2026
];

// E*Trade ICE holdings - live priced via Yahoo Finance (symbol: ICE)
// Share counts derived from E*Trade USD values / ICE price as at 21 Mar 2026
export const etradeHoldings = {
  symbol: 'ICE',
  name: 'ICE (Intercontinental Exchange)',
  esppValueUSD: 145612.77, // Employee Stock Purchase Plan (vested) — E*Trade app 02 Jul 2026
  rsValueUSD: 57446.24, // Restricted Stock (unvested) — E*Trade app 02 Jul 2026
  totalValueUSD: 203059.01,
  // Share counts for live price tracking (derived from USD values / $126.73 ICE price, 02 Jul 2026)
  vestedShares: 1149, // ESPP
  unvestedShares: 453, // RS
  totalShares: 1602,
  account: 'E*Trade' as const,
  currency: 'USD' as const,
  // Upcoming RSU vest dates (shares per tranche). Unvested shares are EXCLUDED
  // from net worth until each date. Populate from E*Trade (dates + share counts).
  vestingSchedule: [] as { date: string; shares: number; label?: string }[],
};
// Fallback GBP value if Yahoo Finance unavailable
export const etradeValue = 109165; // vested only ($145,612.77 / 1.33387), as at 02 Jul 2026

export const propertyHoldings: PropertyHolding[] = [
  {
    id: 'binnacle',
    name: '604 Binnacle House',
    value: 500000,
    mortgage: 273000, // confirmed by Dave 10 Jun 2026
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
    mortgage: 255000, // confirmed by Dave 10 Jun 2026 (matches DRS RE Ltd accounts, Foundation Homes loan ~£256k)
    type: 'keeping',
    autoValue: true,
    address: '505 Cordage House, 21 Cobblestone Square, London E1W 3AQ',
    postcode: 'E1W 3AS',
    premium: 'upper',
    premiumNotes: 'Studio, high floor, nice view',
    rentalIncome: 300,
  },
  { id: 'didcot', name: '9 Fen Violet, Didcot', value: 400000, mortgage: 268270, type: 'selling' },
  { id: 'newbury', name: '6 Hennessey, Newbury', value: 482500, mortgage: 342248, type: 'selling' },
  { id: 'shoeburyness', name: 'Flat 5 Sandpipers, Shoeburyness', value: 335000, mortgage: 213503, type: 'selling' },
];

export const cashHoldings: CashHolding[] = [
  { account: 'NatWest (personal)', balance: 54000 }, // updated 12 Jun 2026 (was £100k; ~£46k deployed into HL investments)
  { account: 'NatWest 8002', balance: 2154 },
  { account: 'Revolut', balance: 1941 },
  { account: 'Premium Bonds', balance: 26000 },
  { account: 'DRS Real Estate Ltd', balance: 22000 },
];

// Dividend/income schedules for all holdings
export const dividendSchedules: DividendSchedule[] = [
  {
    holdingId: 'fidelity-enhanced',
    holdingName: 'Fidelity Enhanced Income',
    holdingType: 'fund',
    annualYieldPercent: 7.54,
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    expectedPayDay: 25,
  },
  {
    holdingId: 'ubs-global',
    holdingName: 'UBS Global Enhanced Eq Income',
    holdingType: 'fund',
    annualYieldPercent: 7.2,
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    expectedPayDay: 28,
  },
  {
    holdingId: 'NVDA',
    holdingName: 'NVIDIA',
    holdingType: 'stock',
    annualYieldPercent: 0.03,
    frequency: 'quarterly',
    paysDividend: true,
    paymentMonths: [1, 4, 7, 10],
    expectedPayDay: 27,
  },
  {
    holdingId: 'GOOGL',
    holdingName: 'Alphabet/Google',
    holdingType: 'stock',
    annualYieldPercent: 0.5,
    frequency: 'quarterly',
    paysDividend: true,
    paymentMonths: [3, 6, 9, 12],
    expectedPayDay: 17,
  },
  {
    holdingId: 'JEQP.L',
    holdingName: 'JEPQ (Nasdaq Equity Premium Income)',
    holdingType: 'stock',
    annualYieldPercent: 10.0,
    frequency: 'monthly',
    paysDividend: true,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    expectedPayDay: 7,
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
