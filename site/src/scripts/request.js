/** Only the most recent request may publish, including after JSON decoding. */
export function latestRequest(read, publish) {
  let generation = 0, controller;
  return {
    cancel() { generation++; controller?.abort(); controller = undefined; },
    async load() {
      controller?.abort();
      const request = ++generation, next = new AbortController(); controller = next;
      publish({ pending: true, error: "" });
      try {
        const data = await read(next.signal);
        if (request === generation) publish({ pending: false, error: "", data });
      } catch (error) {
        if (request === generation) publish({ pending: false, error: error.message || "Please try again." });
      } finally { if (request === generation) controller = undefined; }
    },
  };
}
