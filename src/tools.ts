import type { ResolvedToolRun } from "@amodalai/react";

interface Launcher<I> {
  run(input: I): Promise<ResolvedToolRun>;
}

/**
 * Run an invoke-lane tool and return the handler's result. The SDK resolves
 * an unsuccessful run with a reason prefixed by the tool name. Keep
 * interrupted runs on the error path so callers do not report success.
 */
export async function runTool<I, R = unknown>(launcher: Launcher<I>, input: I): Promise<R | undefined> {
  const res = (await launcher.run(input)) as ResolvedToolRun & { result?: R };
  if (res.outcome.kind !== "complete") {
    throw new Error((res.outcome.reason ?? "The tool run failed.").replace(/^Tool "[^"]+" failed: /, ""));
  }
  return res.result;
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
