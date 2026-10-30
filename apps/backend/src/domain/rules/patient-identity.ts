export function normalizeCpf(value: string): string | null {
  const cpf = value.replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null
  for (const length of [9, 10]) {
    const sum = [...cpf.slice(0, length)].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    )
    const check = (sum * 10) % 11
    if (Number(cpf[length]) !== (check === 10 ? 0 : check)) return null
  }
  return cpf
}

export function normalizeMobile(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  const local =
    digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(local)) return null
  return `+55${local}`
}

export function civilDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null
}

export function isUnderCivilAge(date: Date, now: Date, legalAgeYears: number) {
  const birthdayThisYear = new Date(
    Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const age =
    now.getUTCFullYear() -
    date.getUTCFullYear() -
    (now < birthdayThisYear ? 1 : 0)
  return age < legalAgeYears
}
