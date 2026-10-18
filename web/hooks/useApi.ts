import { useCallback, useEffect, useState } from "react";

/** Load data once (and on demand via `reload`). */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, deps);

  useEffect(reload, [reload]);
  return { data, error, reload };
}
