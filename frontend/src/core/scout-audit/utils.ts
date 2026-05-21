export function pathOfAuditThread(threadId: string) {
  return `/workspace/audits/${encodeURIComponent(threadId)}`;
}

export function pathOfScoutAuditThread(threadId: string) {
  return `/scout-audit/${encodeURIComponent(threadId)}`;
}

export function pathOfAuditThreadView(threadId: string) {
  return `/workspace/audits-view/${encodeURIComponent(threadId)}`;
}
