import { Badge } from "./Badge";

type ReviewStatus = "pending" | "reviewing" | "completed" | "failed" | "not_started" | null | undefined;

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  if (!status || status === "not_started") {
    return <Badge tone="neutral" dot>Not started</Badge>;
  }
  if (status === "pending") return <Badge tone="warn" dot>Pending</Badge>;
  if (status === "reviewing") return <Badge tone="info" dot>Reviewing</Badge>;
  if (status === "completed") return <Badge tone="success" dot>Completed</Badge>;
  if (status === "failed") return <Badge tone="danger" dot>Failed</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}
