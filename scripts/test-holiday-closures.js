var module = { exports: {} };
eval(readFile('js/holiday-closures.js'));
var holidays = module.exports;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

assertEqual(holidays.getClosureReason('2026-10-24'), 'Closed — not operating', 'October 24 closure');
assertEqual(holidays.getClosureReason('2026-10-31'), 'Closed — Halloween', 'October 31 closure');
assertEqual(holidays.getClosureReason('2026-11-26'), 'Thanksgiving Day', 'Thanksgiving 2026');
assertEqual(holidays.getClosureReason('2026-12-25'), 'Christmas Day', 'Christmas 2026');
assertEqual(holidays.getClosureReason('2027-01-01'), "New Year's Day", 'New Year 2027');
assertEqual(holidays.getClosureReason('2027-03-28'), 'Easter Sunday', 'Easter 2027');
assertEqual(holidays.getClosureReason('2027-09-06'), 'Labor Day', 'Labor Day 2027');
assertEqual(holidays.getClosureReason('2026-10-25'), '', 'Ordinary date');

print('PASS manual October closures');
print('PASS major U.S. holidays calculate automatically each year');
