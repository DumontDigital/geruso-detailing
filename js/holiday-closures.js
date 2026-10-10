(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GerusoHolidayClosures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MANUAL_CLOSURES = Object.freeze({
    '2026-10-24': 'Closed — not operating',
    '2026-10-31': 'Closed — Halloween'
  });

  function formatDate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function nthWeekdayOfMonth(year, month, weekday, occurrence) {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - firstWeekday + 7) % 7) + ((occurrence - 1) * 7);
  }

  function lastWeekdayOfMonth(year, month, weekday) {
    const lastDay = new Date(Date.UTC(year, month, 0));
    return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
  }

  // Gregorian Easter calculation (Meeus/Jones/Butcher algorithm).
  function getEasterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = ((19 * a) + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
    const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
    const month = Math.floor((h + l - (7 * m) + 114) / 31);
    const day = ((h + l - (7 * m) + 114) % 31) + 1;
    return { month, day };
  }

  function getMajorHolidayClosures(year) {
    const easter = getEasterDate(year);
    return {
      [formatDate(year, 1, 1)]: "New Year's Day",
      [formatDate(year, 1, nthWeekdayOfMonth(year, 1, 1, 3))]: 'Martin Luther King Jr. Day',
      [formatDate(year, 2, nthWeekdayOfMonth(year, 2, 1, 3))]: "Presidents' Day",
      [formatDate(year, easter.month, easter.day)]: 'Easter Sunday',
      [formatDate(year, 5, lastWeekdayOfMonth(year, 5, 1))]: 'Memorial Day',
      [formatDate(year, 6, 19)]: 'Juneteenth',
      [formatDate(year, 7, 4)]: 'Independence Day',
      [formatDate(year, 9, nthWeekdayOfMonth(year, 9, 1, 1))]: 'Labor Day',
      [formatDate(year, 10, nthWeekdayOfMonth(year, 10, 1, 2))]: 'Indigenous Peoples / Columbus Day',
      [formatDate(year, 11, 11)]: 'Veterans Day',
      [formatDate(year, 11, nthWeekdayOfMonth(year, 11, 4, 4))]: 'Thanksgiving Day',
      [formatDate(year, 12, 25)]: 'Christmas Day'
    };
  }

  function getClosureReason(dateString) {
    const normalized = String(dateString || '').slice(0, 10);
    if (MANUAL_CLOSURES[normalized]) return MANUAL_CLOSURES[normalized];
    const year = Number.parseInt(normalized.slice(0, 4), 10);
    if (!year) return '';
    return getMajorHolidayClosures(year)[normalized] || '';
  }

  function getClosuresForYears(years) {
    return (years || []).reduce((closures, year) => Object.assign(
      closures,
      getMajorHolidayClosures(year),
      Object.fromEntries(Object.entries(MANUAL_CLOSURES).filter(([date]) => date.startsWith(`${year}-`)))
    ), {});
  }

  return {
    MANUAL_CLOSURES,
    getMajorHolidayClosures,
    getClosureReason,
    getClosuresForYears
  };
});
