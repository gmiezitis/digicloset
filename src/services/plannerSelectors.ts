import type { PlannerEntry } from '@/types/planner';
import { groupPlannerEntriesByDay, sortPlannerEntries } from '@/types/planner';

export type CalendarDayCell = {
  calendarDate: string;
  inCurrentMonth: boolean;
  entries: PlannerEntry[];
};

export function groupPlannerDays(entries: PlannerEntry[]) {
  return groupPlannerEntriesByDay(entries);
}

export function buildCalendarMatrix(entries: PlannerEntry[], year: number, month: number): CalendarDayCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const firstDisplayed = new Date(firstOfMonth);
  firstDisplayed.setUTCDate(firstOfMonth.getUTCDate() - startOffset);

  const weeks: CalendarDayCell[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: CalendarDayCell[] = [];
    for (let day = 0; day < 7; day++) {
      const current = new Date(firstDisplayed);
      current.setUTCDate(firstDisplayed.getUTCDate() + week * 7 + day);
      const isoDate = current.toISOString().slice(0, 10);
      const dayEntries = entries.filter(entry => entry.calendarDate === isoDate);
      days.push({
        calendarDate: isoDate,
        inCurrentMonth: current.getUTCMonth() === month,
        entries: sortPlannerEntries(dayEntries),
      });
    }
    weeks.push(days);
  }

  return weeks;
}

export function searchPlannerEntries(entries: PlannerEntry[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return sortPlannerEntries(entries);
  }

  return sortPlannerEntries(
    entries.filter(entry => {
      const haystack = [
        entry.title,
        entry.note ?? '',
        ...(entry.searchKeywords ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(trimmed);
    })
  );
}





