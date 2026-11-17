// Continent-scale regions for filtering, keyed by ISO 3166-1 alpha-2 country code.

export const REGIONS = ['North America', 'Europe', 'Asia', 'Oceania', 'South America', 'Africa'] as const
export type Region = (typeof REGIONS)[number]

const BY_REGION: Record<Region, string> = {
  'North America': 'US CA MX GL',
  Europe:
    'AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GR HR HU IE IS IT LI LT LU LV MD ME MK NL NO PL PT RO RS RU SE SI SK SM UA XK',
  Asia: 'AE AF AM AZ CN GE IL IN IQ IR JP KG KP KR KZ LB MN NP PK SA SY TJ TR TW UZ',
  Oceania: 'AU NZ',
  'South America': 'AR BO CL CO EC PE',
  Africa: 'DZ LS MA ZA',
}

const REGION_OF = new Map<string, Region>()
for (const region of REGIONS) for (const cc of BY_REGION[region].split(' ')) REGION_OF.set(cc, region)

/** The region a country belongs to, or null for a code this table does not know. */
export function regionOf(cc: string): Region | null {
  return REGION_OF.get(cc) ?? null
}
