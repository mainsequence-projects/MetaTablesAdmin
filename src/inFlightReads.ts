/** Share pending reads only; every subscriber keeps its own cancellation. */
type Flight = {
  promise: Promise<unknown>;
  controller: AbortController;
  subscribers: number;
  settled: boolean;
  abortTimer?: ReturnType<typeof setTimeout>;
};

export class InFlightReads {
  private pending = new Map<string, Flight>();

  /** Subsequent reads must observe the state after a mutation/context change. */
  invalidate() {
    this.pending.clear();
  }

  run<T>(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let flight = this.pending.get(key);
    if (!flight) {
      const controller = new AbortController();
      flight = { controller, subscribers: 0, settled: false, promise: Promise.resolve().then(() => load(controller.signal)) };
      this.pending.set(key, flight);
      const current = flight;
      const remove = () => {
        current.settled = true;
        if (this.pending.get(key) === current) this.pending.delete(key);
        clearTimeout(current.abortTimer);
      };
      current.promise.then(remove, remove);
    }
    const current = flight;
    clearTimeout(current.abortTimer);
    current.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return false;
        active = false;
        signal?.removeEventListener("abort", abort);
        current.subscribers--;
        if (current.subscribers === 0 && !current.settled) {
          // React development cleanup/remount can subscribe again in this turn.
          current.abortTimer = setTimeout(() => {
            if (current.subscribers !== 0) return;
            if (this.pending.get(key) === current) this.pending.delete(key);
            current.controller.abort();
          }, 0);
        }
        return true;
      };
      const abort = () => { if (release()) reject(signal?.reason); };
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(
        value => { if (release()) resolve(value as T); },
        error => { if (release()) reject(error); },
      );
    });
  }
}
