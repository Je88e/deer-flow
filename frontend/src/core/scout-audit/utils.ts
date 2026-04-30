export function pathOfAuditThread(threadId: string) {
  return `/workspace/audits/${encodeURIComponent(threadId)}`;
}
