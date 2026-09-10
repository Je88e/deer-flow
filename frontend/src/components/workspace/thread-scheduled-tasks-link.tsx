import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { embedHref } from "@/components/embed/embed-mode";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/hooks";

export function ThreadScheduledTasksLink({
  threadId,
  embedded = false,
}: {
  threadId: string;
  /** EMBED (WIT Shell iframe): carry ?embed=true so the route stays in EMBED mode. */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const path = `/workspace/scheduled-tasks?thread_id=${encodeURIComponent(threadId)}`;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        aria-label={t.sidebar.scheduledTasks}
        href={embedded ? embedHref(path) : path}
      >
        <CalendarClock />
        <span className="hidden sm:inline">{t.sidebar.scheduledTasks}</span>
      </Link>
    </Button>
  );
}
