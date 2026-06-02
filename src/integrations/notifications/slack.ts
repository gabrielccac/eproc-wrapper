declare const process: {
  env: Record<string, string | undefined>;
};

export interface SlackConfig {
  webhookUrl: string;
}

export function getSlackConfigFromEnv(): SlackConfig | null {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  return webhookUrl ? { webhookUrl } : null;
}

export async function sendSlackMessage(
  message: string,
  config: SlackConfig | null = getSlackConfigFromEnv(),
): Promise<void> {
  if (!config) {
    console.log(`[Slack fallback]\n${message}`);
    return;
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: HTTP ${response.status} ${response.statusText}`);
  }
}
