function resolveTimeOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hour = now.getHours();
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
}

export function buildGreeting(now: Date, actor: string): string {
  const timeOfDay = resolveTimeOfDay(now);
  const name = actor && actor.trim().length > 0 ? actor.trim() : "operator";
  return `Good ${timeOfDay}, ${name}.`;
}

export function idlePrompt(): string {
  return "I can show status, list skills, or help plan a task.";
}
