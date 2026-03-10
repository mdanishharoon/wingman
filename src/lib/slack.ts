export async function fetchRecentMessages(oldestTs: string) {
    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
    const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

    if (!SLACK_BOT_TOKEN || !CHANNEL_ID) {
        throw new Error("Missing Slack Environment variables");
    }

    const response = await fetch(`https://slack.com/api/conversations.history?channel=${CHANNEL_ID}&oldest=${oldestTs}&limit=100`, {
        headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`
        }
    });

    const data = await response.json();
    if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
    }

    // data.messages contains messages, newest first. Let's return them as is, 
    // we'll handle reversing in the polling cron.
    return data.messages || [];
}

export async function addReactionToMessage(ts: string) {
    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
    const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

    if (!SLACK_BOT_TOKEN || !CHANNEL_ID) {
        return;
    }

    await fetch(`https://slack.com/api/reactions.add`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`
        },
        body: JSON.stringify({
            channel: CHANNEL_ID,
            timestamp: ts,
            name: 'white_check_mark'
        })
    });
}
