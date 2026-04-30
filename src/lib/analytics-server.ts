import { PostHog } from "posthog-node";

const PROJECT_NAME = "gapsmith";
const PROJECT_OWNER = "gapsmith";
export const POSTHOG_KEY = process.env.POSTHOG_SERVER_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_TEAM_KEY";
export const POSTHOG_HOST = "https://us.i.posthog.com";

export async function trackServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>
) {
  if (!POSTHOG_KEY) return;
  const client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
  });

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      project_name: PROJECT_NAME,
      project_owner: PROJECT_OWNER,
    },
  });

  await client.shutdown();
}
