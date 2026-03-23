const COUNTRY_NAMES: Record<string, string> = {
  UKR: 'Ukraine', RUS: 'Russia', POL: 'Poland', ROU: 'Romania',
  MDA: 'Moldova', ISR: 'Israel', PSE: 'Palestine', JOR: 'Jordan',
  EGY: 'Egypt', ARE: 'UAE', PRT: 'Portugal', ESP: 'Spain',
  ITA: 'Italy', GRC: 'Greece', FRA: 'France', DEU: 'Germany',
  GBR: 'United Kingdom', NLD: 'Netherlands', TUR: 'Turkey',
  CYP: 'Cyprus', THA: 'Thailand', USA: 'United States',
  LBN: 'Lebanon', SYR: 'Syria', IRQ: 'Iraq', IRN: 'Iran',
  SAU: 'Saudi Arabia', BHR: 'Bahrain', QAT: 'Qatar', KWT: 'Kuwait',
  OMN: 'Oman', MAR: 'Morocco', TUN: 'Tunisia', HRV: 'Croatia',
  MNE: 'Montenegro', BGR: 'Bulgaria', CZE: 'Czech Republic',
  AUT: 'Austria', CHE: 'Switzerland', BEL: 'Belgium',
  IRL: 'Ireland', DNK: 'Denmark', SWE: 'Sweden', NOR: 'Norway',
  FIN: 'Finland', JPN: 'Japan', KOR: 'South Korea', CHN: 'China',
  IND: 'India', AUS: 'Australia', NZL: 'New Zealand', BRA: 'Brazil',
  MEX: 'Mexico', CAN: 'Canada', ARG: 'Argentina', CHL: 'Chile',
  COL: 'Colombia', ZAF: 'South Africa', KEN: 'Kenya', TZA: 'Tanzania',
  SGP: 'Singapore', MYS: 'Malaysia', IDN: 'Indonesia', PHL: 'Philippines',
  VNM: 'Vietnam',
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code?.toUpperCase()] || COUNTRY_NAMES[code] || code
}

export function formatDestination(code: string): string {
  const name = countryName(code)
  return name !== code ? `${name} (${code})` : code
}

export default COUNTRY_NAMES
