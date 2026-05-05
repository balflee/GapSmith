import type { Metadata } from "next";
import { DocsShell } from "../../_components/docs-shell";
import { PlaygroundClient } from "./playground-client";

export const metadata: Metadata = {
  title: "API Playground — GapSmith",
  description: "Interactive code-snippet playground for the GapSmith Agent API. Pick an endpoint, configure params, copy runnable curl/Python/TS code.",
};

export default function PlaygroundPage() {
  return (
    <DocsShell active="/docs/api/playground" wide>
      <PlaygroundClient />
    </DocsShell>
  );
}
