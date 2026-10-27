export const TIME_ZONE = "America/Sao_Paulo";

const OPEN_MINUTE = 8 * 60;
const CLOSE_MINUTE = 18 * 60;

const WEEKDAY = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
} as const;

export type CivilTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const found = parts.find((item) => item.type === type);
  if (!found) {
    throw new Error(`Parte de data ausente: ${type}`);
  }
  return found.value;
}

export function civilFromInstant(instant: Date): CivilTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).formatToParts(instant);

  let hour = Number(part(parts, "hour"));
  if (hour === 24) {
    hour = 0;
  }

  return {
    year: Number(part(parts, "year")),
    month: Number(part(parts, "month")),
    day: Number(part(parts, "day")),
    hour,
    minute: Number(part(parts, "minute")),
    second: Number(part(parts, "second")),
    millisecond: Number(part(parts, "fractionalSecond")),
  };
}

function zoneOffsetMs(instant: Date): number {
  const local = civilFromInstant(instant);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
  );
  return asUtc - instant.getTime();
}

export function instantFromCivil(civil: CivilTime): Date {
  const utcGuess = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
    civil.millisecond,
  );
  const firstPass = utcGuess - zoneOffsetMs(new Date(utcGuess));
  return new Date(utcGuess - zoneOffsetMs(new Date(firstPass)));
}

export function weekdayIndex(instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(instant);
  const index = WEEKDAY[name as keyof typeof WEEKDAY];
  if (index === undefined) {
    throw new Error(`Dia da semana inesperado: ${name}`);
  }
  return index;
}

function isWeekend(civil: CivilTime): boolean {
  const day = weekdayIndex(instantFromCivil(civil));
  return day === 0 || day === 6;
}

function addCalendarDays(civil: CivilTime, days: number): CivilTime {
  const shifted = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day + days),
  );
  return {
    ...civil,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function minutesOfDay(civil: CivilTime): number {
  return (
    civil.hour * 60 +
    civil.minute +
    civil.second / 60 +
    civil.millisecond / 60_000
  );
}

function atMinute(civil: CivilTime, minuteOfDay: number): CivilTime {
  const whole = Math.floor(minuteOfDay);
  const fraction = minuteOfDay - whole;
  const secondWhole = Math.floor(fraction * 60);
  return {
    ...civil,
    hour: Math.floor(whole / 60),
    minute: whole % 60,
    second: secondWhole,
    millisecond: Math.round((fraction * 60 - secondWhole) * 1000),
  };
}

function nextWindowOpen(civil: CivilTime): CivilTime {
  let cursor = atMinute(addCalendarDays(civil, 1), OPEN_MINUTE);
  while (isWeekend(cursor)) {
    cursor = atMinute(addCalendarDays(cursor, 1), OPEN_MINUTE);
  }
  return cursor;
}

function snapToBusinessWindow(civil: CivilTime): CivilTime {
  if (isWeekend(civil) || minutesOfDay(civil) >= CLOSE_MINUTE) {
    return nextWindowOpen(civil);
  }
  if (minutesOfDay(civil) < OPEN_MINUTE) {
    return atMinute(civil, OPEN_MINUTE);
  }
  return civil;
}

export function addBusinessMinutes(from: Date, minutes: number): Date {
  if (minutes < 0) {
    throw new RangeError("O prazo em minutos úteis não pode ser negativo.");
  }

  let civil = snapToBusinessWindow(civilFromInstant(from));
  let remaining = minutes;

  while (remaining > 0) {
    const available = CLOSE_MINUTE - minutesOfDay(civil);
    if (remaining <= available) {
      civil = atMinute(civil, minutesOfDay(civil) + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      civil = nextWindowOpen(civil);
    }
  }

  return instantFromCivil(civil);
}

export function addBusinessDays(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError("Dias úteis precisam ser um inteiro maior ou igual a zero.");
  }

  let civil = civilFromInstant(from);
  let remaining = days;
  while (remaining > 0) {
    civil = addCalendarDays(civil, 1);
    if (!isWeekend(civil)) {
      remaining -= 1;
    }
  }
  return instantFromCivil(civil);
}
