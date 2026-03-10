import { NextResponse } from 'next/server';
import { draftWinBackEmail } from '../../../lib/ai';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { customerEmail, feedback, surveyResponse, planAmountDollars } = body;

        if (!customerEmail) {
            return NextResponse.json({ error: 'customerEmail is required' }, { status: 400 });
        }

        const draft = await draftWinBackEmail(customerEmail, feedback, surveyResponse, planAmountDollars);

        if (!draft) {
            return NextResponse.json({ error: 'Failed to generate email draft' }, { status: 500 });
        }

        return NextResponse.json(draft);
    } catch (err: any) {
        console.error("Draft email error:", err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
