import type { CustomForm, CustomFormDecision, CustomFormResponse } from "../types";

export function overallDecision(
  response: CustomFormResponse,
  fields: CustomForm["fields"],
): CustomFormDecision {
  const decisions = response.fieldDecisions;
  if (decisions && Object.keys(decisions).length > 0) {
    let anyPending = false;
    for (const f of fields) {
      const d = decisions[f.id];
      if (d === "rejected") return "rejected";
      if (d !== "approved") anyPending = true;
    }
    return anyPending ? "pending" : "approved";
  }
  return response.decision ?? "pending";
}

export function decisionTone(d: CustomFormDecision) {
  if (d === "approved") return "success" as const;
  if (d === "rejected") return "danger" as const;
  return "warn" as const;
}
