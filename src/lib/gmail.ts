import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SENDER_ADDRESS = process.env.GMAIL_SENDER_ADDRESS;

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // Must match the redirect URI
);

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN,
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

export async function sendEmail(to: string, subject: string, bodyText: string) {
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !SENDER_ADDRESS) {
        throw new Error('Missing Google Gmail API credentials in environment variables.');
    }

    // Create the raw email string
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        `From: Danish Haroon <${SENDER_ADDRESS}>`,
        `To: ${to}`,
        `Content-Type: text/plain; charset=utf-8`,
        `MIME-Version: 1.0`,
        `Subject: ${utf8Subject}`,
        '',
        bodyText,
    ];
    const message = messageParts.join('\n');

    // The Gmail API requires the email to be base64url encoded
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    try {
        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });
        return res.data;
    } catch (error) {
        console.error('Error sending email via Gmail API:', error);
        throw error;
    }
}
