import { Injectable } from '@nestjs/common';

const DEFAULT_TRIAL_DAYS = 14;
const MIN_TRIAL_DAYS = 1;
const MAX_TRIAL_DAYS = 90;

export function resolveTrialDays(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_TRIAL_DAYS;
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < MIN_TRIAL_DAYS ||
    value > MAX_TRIAL_DAYS
  ) {
    throw new Error(
      `TRIAL_DAYS must be an integer from ${MIN_TRIAL_DAYS} to ${MAX_TRIAL_DAYS}.`,
    );
  }
  return value;
}

/** Parsed once while Nest constructs the module, so bad terms stop startup. */
@Injectable()
export class OrganizationCommercialConfiguration {
  readonly trialDays = resolveTrialDays(process.env.TRIAL_DAYS);
}
