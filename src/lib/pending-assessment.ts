import type { Verdict } from "@/lib/verdict";

const STORAGE_KEY = "eivor:pending-assessment";

export type PendingAssessment = {
  description: string;
  verdict: Verdict;
  summary?: string;
};

export function savePendingAssessment(data: PendingAssessment) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage unavailable (e.g. private browsing) - the dashboard
    // still works, it just creates a blank first case instead of one
    // pre-filled from this description.
  }
}

export function takePendingAssessment(): PendingAssessment | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as PendingAssessment;
  } catch {
    return null;
  }
}
