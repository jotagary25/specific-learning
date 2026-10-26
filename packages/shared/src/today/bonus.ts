/**
 * The weekday ceiling (methodology §3 "ceiling plus parking list"): after the timer ends,
 * "5 more minutes" is allowed once per session on weekdays and without limit on weekends.
 */
export const BONUS_STEP_MIN = 5;
export const BONUS_MAX_MIN = 120;

/** Saturday (6) or Sunday (0); the caller reads the weekday in the user's time zone. */
export const isWeekendDay = (weekday: number): boolean => weekday === 0 || weekday === 6;

/** Whether another bonus step may be taken after `bonusMinSoFar` bonus minutes. */
export function bonusAllowed(weekend: boolean, bonusMinSoFar: number): boolean {
  if (weekend) return bonusMinSoFar + BONUS_STEP_MIN <= BONUS_MAX_MIN;
  return bonusMinSoFar === 0;
}

/** Whether a total of `bonusMin` bonus minutes respects the rule. */
export function bonusTotalValid(weekend: boolean, bonusMin: number): boolean {
  if (bonusMin < 0 || bonusMin % BONUS_STEP_MIN !== 0) return false;
  return weekend ? bonusMin <= BONUS_MAX_MIN : bonusMin <= BONUS_STEP_MIN;
}
