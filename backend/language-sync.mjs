// Keep the latest host preference until the current service operation finishes.
export function deferredLanguageSync(apply) {
  let pending, task;
  return {
    request(language) { pending = language; },
    hasPending() { return pending !== undefined; },
    drain() {
      if (task) return task;
      task = (async () => {
        while (pending !== undefined) {
          const language = pending;
          pending = undefined;
          await apply(language);
        }
      })().finally(() => { task = undefined; });
      return task;
    },
  };
}
