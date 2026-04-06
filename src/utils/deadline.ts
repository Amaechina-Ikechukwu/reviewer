export function isWithinDeadline(opensAt: Date, closesAt: Date, now = new Date()) {
  if (now < opensAt) {
    return {
      canSubmit: false,
      reason: "Submission window has not opened yet.",
    };
  }

  if (now > closesAt) {
    return {
      canSubmit: false,
      reason: "Submission deadline has passed.",
    };
  }

  return {
    canSubmit: true,
    reason: "",
  };
}
