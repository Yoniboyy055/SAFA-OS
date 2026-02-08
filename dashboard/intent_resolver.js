(function attachIntentResolver(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.IntentResolver = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function buildResolver() {
  const PANEL_INTENTS = [
    { match: /(approvals?)/, panel: "approvals", response: "Opening approvals." },
    { match: /(audit|logs?)/, panel: "audit", response: "Opening audit tail." },
    { match: /(timeline|executions?)/, panel: "executions", response: "Opening execution timeline." },
    { match: /(system|kill switch|network)/, panel: "system", response: "Opening system controls." },
    { match: /(plan viewer|show plan)/, panel: "plan", response: "Opening plan viewer." },
    { match: /(command deck|command center)/, panel: "command", response: "Opening command deck." }
  ];

  function normalize(text) {
    return String(text || "").toLowerCase().trim();
  }

  function resolveIntent(text) {
    const normalized = normalize(text);
    if (!normalized) {
      return { type: "unknown", response: "Say what you want me to do." };
    }
    if (/^(hi|hello|hey)\b/.test(normalized)) {
      return { type: "smalltalk", response: "Here when you are." };
    }
    for (const entry of PANEL_INTENTS) {
      if (entry.match.test(normalized)) {
        return { type: "panel", panel: entry.panel, response: entry.response };
      }
    }
    if (/(run tests?|test suite)/.test(normalized)) {
      return {
        type: "run_skill",
        skill: "run_tests",
        input: {},
        response: "Running the test suite." 
      };
    }
    if (/(execute|run it|do it|proceed)/.test(normalized)) {
      return { type: "exec", response: "Executing the last plan." };
    }
    if (/(plan|draft|outline|status report|recap)/.test(normalized)) {
      return { type: "plan", response: "Drafting a plan." };
    }
    return { type: "plan", response: "Drafting a plan." };
  }

  function timeOfDay(date) {
    const hour = date.getHours();
    if (hour < 5) {
      return "night";
    }
    if (hour < 12) {
      return "morning";
    }
    if (hour < 18) {
      return "afternoon";
    }
    return "evening";
  }

  function buildPresence(date, name, lastSeenMs) {
    const now = date.getTime();
    const safeName = name && String(name).trim().length > 0 ? String(name).trim() : "there";
    let greeting;
    if (typeof lastSeenMs === "number") {
      const delta = now - lastSeenMs;
      if (delta < 45 * 60 * 1000) {
        greeting = `Still here, ${safeName}.`;
      } else if (delta < 6 * 60 * 60 * 1000) {
        greeting = `Welcome back, ${safeName}.`;
      }
    }
    if (!greeting) {
      const period = timeOfDay(date);
      const title = period === "night" ? "Good evening" : `Good ${period}`;
      greeting = `${title}, ${safeName}.`;
    }
    const note = "Local dashboard ready.";
    return { greeting, note };
  }

  return {
    resolveIntent,
    buildPresence
  };
});
