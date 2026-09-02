import type { ResolvedToolRun } from "@amodalai/react";

interface Launcher<I> {
  run(input: I): Promise<ResolvedToolRun>;
}

/**
 * Run an invoke-lane tool and return the handler's result. The SDK resolves
 * a thrown handler error as `outcome.kind: "failed"` with the message in
 * `reason` (prefixed by the runtime with the tool's name), so this turns it
 * back into a rejection carrying the handler's own message.
 */
export async function runTool<I, R = unknown>(launcher: Launcher<I>, input: I): Promise<R | undefined> {
  const res = (await launcher.run(input)) as ResolvedToolRun & { result?: R };
  if (res.outcome.kind === "failed") {
    throw new Error((res.outcome.reason ?? "The tool run failed.").replace(/^Tool "[^"]+" failed: /, ""));
  }
  return res.result;
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
