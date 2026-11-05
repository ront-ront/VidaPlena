import { Temporal } from '@js-temporal/polyfill'

export type ScheduleRule = {
  weekday: number
  localStart: string
  localEnd: string
  effectiveFrom: string
  effectiveTo: string | null
  modality: 'onsite' | 'remote'
}
export type ScheduleBlock = {
  startsAt: string
  endsAt: string
  kind: 'break' | 'vacation' | 'holiday' | 'emergency'
  reason: string
}
export function localInstant(
  date: string,
  time: string,
  timeZone: string,
): Date {
  let day = Temporal.PlainDate.from(date)
  let clock = time
  if (time === '24:00') {
    day = day.add({ days: 1 })
    clock = '00:00'
  }
  return new Date(
    day
      .toPlainDateTime(clock)
      .toZonedDateTime(timeZone, { disambiguation: 'reject' })
      .epochMilliseconds,
  )
}
export function firstRuleDate(rule: ScheduleRule, from = rule.effectiveFrom) {
  const lower = Temporal.PlainDate.from(
    from > rule.effectiveFrom ? from : rule.effectiveFrom,
  )
  return lower
    .add({ days: (rule.weekday - lower.dayOfWeek + 7) % 7 })
    .toString()
}
export function validSchedule(
  rules: ScheduleRule[],
  blocks: ScheduleBlock[],
  timeZone: string,
) {
  try {
    for (const rule of rules) {
      if (
        rule.localStart >= rule.localEnd ||
        (rule.effectiveTo && rule.effectiveFrom > rule.effectiveTo)
      )
        return false
      Temporal.PlainDate.from(rule.effectiveFrom)
      if (rule.effectiveTo) Temporal.PlainDate.from(rule.effectiveTo)
      const first = firstRuleDate(rule)
      if (!rule.effectiveTo || first <= rule.effectiveTo) {
        localInstant(first, rule.localStart, timeZone)
        localInstant(first, rule.localEnd, timeZone)
      }
    }
    for (let i = 0; i < rules.length; i++)
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i],
          b = rules[j]
        if (
          a.weekday !== b.weekday ||
          a.localStart >= b.localEnd ||
          b.localStart >= a.localEnd
        )
          continue
        const lower =
          a.effectiveFrom > b.effectiveFrom ? a.effectiveFrom : b.effectiveFrom
        const upper =
          a.effectiveTo && b.effectiveTo
            ? a.effectiveTo < b.effectiveTo
              ? a.effectiveTo
              : b.effectiveTo
            : (a.effectiveTo ?? b.effectiveTo)
        if (!upper || firstRuleDate(a, lower) <= upper) return false
      }
    return blocks.every(
      (b) => new Date(b.startsAt).getTime() < new Date(b.endsAt).getTime(),
    )
  } catch {
    return false
  }
}
export function civilWindow(
  from: string,
  to: string,
  timeZone: string,
  maxDays: number,
) {
  const start = Temporal.PlainDate.from(from),
    end = Temporal.PlainDate.from(to)
  const days = start.until(end).days + 1
  if (days < 1 || days > maxDays) throw new RangeError('Janela civil inválida.')
  return {
    startsAt: localInstant(from, '00:00', timeZone),
    endsAt: localInstant(end.add({ days: 1 }).toString(), '00:00', timeZone),
  }
}

export function scheduleContains(
  rules: ScheduleRule[],
  startsAt: Date,
  endsAt: Date,
  modality: 'onsite' | 'remote',
  timeZone: string,
  durationAlignment?: number,
) {
  const local = Temporal.Instant.from(
    startsAt.toISOString(),
  ).toZonedDateTimeISO(timeZone)
  const date = local.toPlainDate().toString()
  return rules.some((rule) => {
    if (
      rule.weekday !== local.dayOfWeek ||
      rule.modality !== modality ||
      rule.effectiveFrom > date ||
      (rule.effectiveTo && rule.effectiveTo < date)
    )
      return false
    try {
      const opening = localInstant(date, rule.localStart, timeZone),
        closing = localInstant(date, rule.localEnd, timeZone)
      if (startsAt < opening || endsAt > closing) return false
      if (durationAlignment) {
        const [h, m] = rule.localStart.split(':').map(Number)
        return (
          local.second === 0 &&
          local.millisecond === 0 &&
          (local.hour * 60 + local.minute - h * 60 - m) % durationAlignment ===
            0
        )
      }
      return true
    } catch {
      return false
    }
  })
}
export function scheduleBlocked(
  blocks: ScheduleBlock[],
  startsAt: Date,
  endsAt: Date,
  includeEmergency = true,
) {
  return blocks.some(
    (block) =>
      (includeEmergency || block.kind !== 'emergency') &&
      new Date(block.startsAt) < endsAt &&
      new Date(block.endsAt) > startsAt,
  )
}
