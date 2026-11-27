import type { AppBindings } from '../env';

export interface WebhookEventPayload {
  event: 'proposal.submitted' | 'review.submitted';
  id: string;
  summary: string;
  actor: string;
  created_at: string;
}

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Optional non-blocking Webhook notification hook (activates only when NOTIFY_WEBHOOK_URL secret is set).
 * Always tied to ctx.waitUntil so responses never block and background promises never drop.
 */
export function dispatchWebhook(
  env: AppBindings,
  ctx: WaitUntilContext | undefined,
  payload: WebhookEventPayload
): void {
  const url = env.NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return;

  const task = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      text: `[OPAE] ${payload.event}: ${payload.id} by ${payload.actor} — ${payload.summary}`,
      ...payload,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(
          JSON.stringify({
            level: 'warn',
            msg: 'webhook_non_2xx',
            status: res.status,
            event: payload.event,
          })
        );
      }
    })
    .catch((err) => {
      console.error(
        JSON.stringify({
          level: 'warn',
          msg: 'webhook_failed',
          event: payload.event,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    });

  if (ctx) {
    ctx.waitUntil(task);
  }
}
