import { useMemo, useState } from "react";

export type StatusWrite = (message: string) => void;
export type StatusRecovery = {
  sync<T>(site: string, operation: () => T, fallback: T, onFailure?: () => void): T;
  async<T>(site: string, operation: () => Promise<T>, fallback: T, onFailure?: () => void): Promise<T>;
};
export type SaveStatus = { setSaved: StatusWrite; recovery: StatusRecovery };

// Pure and injectable: runs the existing fallback side effects, then reports the original error once.
export function createStatusRecovery(write: StatusWrite): StatusRecovery {
  const fail = (site: string, error: unknown, onFailure?: () => void) => {
    onFailure?.();
    write(`Error: ${site}: ${String(error)}`);
  };
  return {
    sync(site, operation, fallback, onFailure) {
      try {
        return operation();
      } catch (error) {
        fail(site, error, onFailure);
        return fallback;
      }
    },
    async async(site, operation, fallback, onFailure) {
      try {
        return await operation();
      } catch (error) {
        fail(site, error, onFailure);
        return fallback;
      }
    },
  };
}

// The only owner of the visible save status; every other module borrows setSaved/recovery.
export function useSaveStatus() {
  const [saved, setSaved] = useState("");
  const recovery = useMemo(() => createStatusRecovery(setSaved), []);
  return { saved, setSaved, recovery };
}
