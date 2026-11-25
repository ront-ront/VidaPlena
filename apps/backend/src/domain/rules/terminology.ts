export const terminologyKinds = ['CID10', 'TUSS'] as const
export type TerminologyKind = (typeof terminologyKinds)[number]
export function terminologySearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
