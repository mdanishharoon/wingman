import { NextResponse } from 'next/server';
import { sendEmail } from '../../../lib/gmail';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { to, subject, text } = body;

        if (!to || !subject || !text) {
            return NextResponse.json(
                { error: 'Missing required fields: to, subject, text' },
                { status: 400 }
            );
        }

        const result = await sendEmail(to, subject, text);

        return NextResponse.json({ success: true, messageId: result.id });
    } catch (error: any) {
        console.error('Error in /api/send-email:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send email' },
            { status: 500 }
        );
    }
}
