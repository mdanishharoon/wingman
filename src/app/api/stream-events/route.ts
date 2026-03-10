import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { fetchRecentMessages, addReactionToMessage } from '../../../lib/slack';
import { parseSlackMessage, scoreChurnReason } from '../../../lib/ai';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const encoder = new TextEncoder();

    // Create a TransformStream to stream data to the client
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Helper to send individual events to the client
    const sendEvent = async (event: string, data: any) => {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    };

    const processEvents = async () => {
        try {
            const { data: configData, error: configError } = await supabase
                .from('config')
                .select('value')
                .eq('key', 'last_poll_ts')
                .single();

            if (configError) {
                throw new Error("Failed to fetch config");
            }

            const lastPollTs = configData.value || '0';
            await sendEvent('info', { message: 'Fetching messages from Slack...' });

            const messages = await fetchRecentMessages(lastPollTs);

            if (messages.length === 0) {
                await sendEvent('done', { processed: 0, message: 'No new events found.' });
                writer.close();
                return;
            }

            const sortedMessages = messages.sort((a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts));
            let newestTs = lastPollTs;
            let processedCount = 0;

            await sendEvent('info', { message: `Found ${sortedMessages.length} messages. Processing...` });

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

                const { data: insertedEvent, error: insertError } = await supabase
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

                // Immediately stream this newly processed event back to the frontend
                await sendEvent('newEvent', insertedEvent);
            }

            if (newestTs !== lastPollTs) {
                await supabase
                    .from('config')
                    .update({ value: newestTs })
                    .eq('key', 'last_poll_ts');
            }

            await sendEvent('done', { processed: processedCount, message: `Finished processing ${processedCount} events.` });

        } catch (err: any) {
            console.error("Streaming error:", err);
            await sendEvent('error', { message: err.message || 'Error processing events' });
        } finally {
            writer.close();
        }
    };

    // Start processing in the background so the stream responds immediately
    processEvents();

    return new NextResponse(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
