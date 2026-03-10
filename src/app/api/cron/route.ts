import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { fetchRecentMessages, addReactionToMessage } from '../../../lib/slack';
import { parseSlackMessage, scoreChurnReason } from '../../../lib/ai';

// Set max duration if deployed on Vercel Pro (optional, ignored on hobby)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // Optional: Verify the request is coming from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (
        process.env.CRON_SECRET &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
        process.env.NODE_ENV !== 'development'
    ) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    console.log("Starting daily cron sync for auth events...");

    try {
        const { data: configData, error: configError } = await supabase
            .from('config')
            .select('value')
            .eq('key', 'last_poll_ts')
            .single();

        if (configError) throw new Error("Failed to fetch config");

        const lastPollTs = configData.value || '0';
        const messages = await fetchRecentMessages(lastPollTs);

        if (messages.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: 'No new events found.' });
        }

        const sortedMessages = messages.sort((a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts));
        let newestTs = lastPollTs;
        let processedCount = 0;

        for (const msg of sortedMessages) {
            const { data: existing } = await supabase
                .from('churn_events')
                .select('id')
                .eq('slack_message_ts', msg.ts)
                .single();

            if (existing) {
                newestTs = parseFloat(msg.ts) > parseFloat(newestTs) ? msg.ts : newestTs;
                continue;
            }

            if (!msg.text) continue;

            // Parse with AI
            const parsedData = await parseSlackMessage(msg.text);
            if (!parsedData || parsedData.event_type === 'other') {
                newestTs = parseFloat(msg.ts) > parseFloat(newestTs) ? msg.ts : newestTs;
                continue;
            }

            const isCancellation = parsedData.event_type === 'cancellation';
            let aiScorePassed = null;
            let aiScoreReason = null;
            let status = 'pending';

            if (isCancellation) {
                const score = await scoreChurnReason(
                    parsedData.feedback,
                    parsedData.survey_response,
                    parsedData.plan_amount_dollars
                );
                if (score) {
                    aiScorePassed = score.pass;
                    aiScoreReason = score.reason;
                    status = score.pass ? 'pending' : 'skipped';
                } else {
                    status = 'skipped';
                }
            } else if (parsedData.event_type === 'discount_accepted') {
                status = 'skipped';
            }

            const newEventData = {
                slack_message_ts: msg.ts,
                event_type: parsedData.event_type,
                customer_email: parsedData.customer_email || 'unknown',
                customer_since: parsedData.customer_since || null,
                plan_amount_dollars: parsedData.plan_amount_dollars || null,
                feedback: parsedData.feedback || null,
                survey_response: parsedData.survey_response || null,
                discount_amount: parsedData.discount_amount || null,
                ai_score_passed: aiScorePassed,
                ai_score_reason: aiScoreReason,
                status,
            };

            const { error: insertError } = await supabase
                .from('churn_events')
                .insert(newEventData)
                .select()
                .single();

            if (insertError) {
                console.error("Error inserting churn event:", insertError);
                continue;
            }

            await addReactionToMessage(msg.ts);

            processedCount++;
            newestTs = parseFloat(msg.ts) > parseFloat(newestTs) ? msg.ts : newestTs;
        }

        if (newestTs !== lastPollTs) {
            await supabase
                .from('config')
                .update({ value: newestTs })
                .eq('key', 'last_poll_ts');
        }

        return NextResponse.json({ success: true, processed: processedCount, message: `Finished processing ${processedCount} events via CRON.` });

    } catch (err: any) {
        console.error("Cron error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
