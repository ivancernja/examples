import { Topic, Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";

export interface TeamPost { message: string; toolCallId?: string }

/** Approved team posts go out through Pub/Sub, so delivery retries without re-running the agent. */
export const teamPosts = new Topic<TeamPost>("team-posts", { deliveryGuarantee: "at-least-once" });

export const _deliver = new Subscription(teamPosts, "deliver-team-post", {
  handler: async (p) => {
    // Call your chat API here (Slack, Discord, ...).
    log.info("team post delivered", { message: p.message });
  },
});
