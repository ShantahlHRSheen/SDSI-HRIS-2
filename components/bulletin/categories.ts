import type { BadgeTone } from "@/components/Badge";
import type { AnnouncementCategory } from "@/lib/types";

export const CATEGORY_TONE: Record<AnnouncementCategory, BadgeTone> = {
  announcement: "info",
  holiday: "good",
  event: "warning",
  memo: "muted",
  policy: "serious",
};
export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  announcement: "Announcement",
  holiday: "Holiday",
  event: "Event",
  memo: "Memo",
  policy: "Policy",
};
