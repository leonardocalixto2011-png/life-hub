import PostalMime from "postal-mime";

export interface Env {
  INBOUND_URL: string;
  INBOUND_SECRET: string;
}

/**
 * Cloudflare Email Worker: receives mail routed by Email Routing, parses it,
 * and forwards a compact JSON payload to Life Hub's /api/inbound. Never
 * rejects the message — a forwarding failure shouldn't bounce the sender's mail.
 */
export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
    try {
      const email = await PostalMime.parse(message.raw);

      const payload = {
        source: "cloudflare",
        data: {
          from: message.from,
          to: message.to,
          subject: email.subject ?? "",
          text: email.text ?? "",
          html: email.html ?? "",
          messageId: email.messageId ?? null,
        },
      };

      await fetch(env.INBOUND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-inbound-secret": env.INBOUND_SECRET,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("inbound worker error:", err);
    }
  },
} satisfies ExportedHandler<Env>;
