// Shared by every place that lets a user edit structured answers directly
// (the document panel, the pre-generation review screen) - all of them
// write to the exact same project_answers row the chat writes to, via
// the same /api/projekt/answers endpoint (which itself calls the same
// mergeAnswers() the chat's route uses). One fetch helper here means
// that's true by construction, not by convention across copies.
export async function saveProjectAnswers(
  projectId: string,
  update: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/projekt/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, answers: update }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.answers ?? {};
  } catch {
    return null;
  }
}
