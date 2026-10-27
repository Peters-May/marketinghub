export type RecipientPurpose = "marketing" | "pitch";

/**
 * Marketing sends need an explicit opt-in.
 * A pitch may include a press contact, or anyone on a press or mixed list,
 * without that opt-in. Suppressions are applied by the caller.
 */
export function allowsRecipient(input: {
  purpose: RecipientPurpose;
  marketingConsent: boolean | null | undefined;
  onPressOrMixedList: boolean;
  isPress: boolean;
}): boolean {
  if (
    input.purpose === "pitch" &&
    (input.onPressOrMixedList || input.isPress)
  ) {
    return true;
  }
  return input.marketingConsent === true;
}

export function emptyRecipientError(purpose: RecipientPurpose): string {
  if (purpose === "pitch") {
    return "No recipients (check the press list and the suppression list)";
  }
  return "No consented recipients (marketing opt-in required; check audience and suppressions)";
}
