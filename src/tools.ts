import type { ResolvedToolRun } from "@amodalai/react";

interface Launcher<I> {
  run(input: I): Promise<ResolvedToolRun>;
}

/**
 * Run an invoke-lane tool and return the handler's result. The SDK resolves
 * a thrown handler error as `outcome.kind: "failed"` with the message in
 * `reason`, so this turns it back into a rejection.
 */
export async function runTool<I, R = unknown>(launcher: Launcher<I>, input: I): Promise<R | undefined> {
  const res = (await launcher.run(input)) as ResolvedToolRun & { result?: R };
  if (res.outcome.kind === "failed") throw new Error(res.outcome.reason ?? "The tool run failed.");
  return res.result;
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
