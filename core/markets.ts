export const MARKETS = {
  CI: { name: 'Côte d’Ivoire', language: 'fr' }, CM: { name: 'Cameroun', language: 'fr' }, CG: { name: 'Congo', language: 'fr' }, FR: { name: 'France', language: 'fr' }, MA: { name: 'Maroc', language: 'fr' }, SN: { name: 'Sénégal', language: 'fr' }, TN: { name: 'Tunisie', language: 'fr' },
  AE: { name: 'United Arab Emirates', language: 'en' }, EG: { name: 'Egypt', language: 'en' }, GH: { name: 'Ghana', language: 'en' }, KE: { name: 'Kenya', language: 'en' }, NG: { name: 'Nigeria', language: 'en' }, US: { name: 'United States', language: 'en' },
} as const;
export type MarketCode = keyof typeof MARKETS;
export type Locale = 'fr' | 'en';
export const marketCodes = Object.keys(MARKETS) as MarketCode[];
export function marketForCountry(value: string): MarketCode | null { const code = value.trim().toUpperCase() as MarketCode; return code in MARKETS ? code : null; }
export function localeForCountry(value: string): Locale { const code = marketForCountry(value); return code ? MARKETS[code].language : 'fr'; }
