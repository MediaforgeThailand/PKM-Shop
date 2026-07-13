// PKM-Shop — rider round cutoff math (Ready.md §3.1), mirroring the SQL function
// public.pkm_compute_round_at so the AI can quote the round to the customer at payment time.
// The SQL version is authoritative for assignment; this TS mirror is covered by tests that
// pin the same 12:29 / 12:30 / 12:31 and cross-midnight edge cases.
//
// Asia/Bangkok is UTC+7 year-round (no DST), so a fixed offset is exact.

const BKK_OFFSET_MIN = 7 * 60;
const HOUR_MS = 3600 * 1000;

// Given the moment an order becomes complete (payment confirmed), return the departure
// timestamp of the rider round it falls into:
//   minute < 30  -> next top-of-hour
//   minute >= 30 -> top-of-hour + 2h
export function computeRoundAt(completedAt: Date): Date {
  const bkk = new Date(completedAt.getTime() + BKK_OFFSET_MIN * 60000);
  const minute = bkk.getUTCMinutes();
  const topOfHourBkkMs = Date.UTC(
    bkk.getUTCFullYear(),
    bkk.getUTCMonth(),
    bkk.getUTCDate(),
    bkk.getUTCHours(),
    0,
    0,
    0,
  );
  const addHours = minute < 30 ? 1 : 2;
  const roundBkkMs = topOfHourBkkMs + addHours * HOUR_MS;
  return new Date(roundBkkMs - BKK_OFFSET_MIN * 60000);
}

// "14:00" label in Bangkok local time for a round departure timestamp.
export function roundLabelBangkok(roundAt: Date): string {
  const bkk = new Date(roundAt.getTime() + BKK_OFFSET_MIN * 60000);
  const hh = String(bkk.getUTCHours()).padStart(2, '0');
  return `${hh}:00`;
}
