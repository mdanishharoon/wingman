import { GoogleGenAI, Type } from '@google/genai';
import { Groq } from 'groq-sdk';

export async function parseSlackMessage(rawMessageText: string) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
        throw new Error("No AI API key found. Please set GEMINI_API_KEY or GROQ_API_KEY.");
    }

    const prompt = `You are parsing a Slack notification from Churnkey, a subscription cancellation management tool.

Here is the raw Slack message:
${rawMessageText}

Extract the following fields. If a field is not present, return null for it.

Respond in JSON only, no markdown, no backticks:
{
  "event_type": "cancellation" or "discount_accepted" or "other",
  "customer_email": "email address",
  "plan_amount_dollars": number or null,
  "customer_since": "YYYY-MM-DD" or null,
  "feedback": "freeform text the user provided" or null,
  "survey_response": "structured reason if identifiable" or null,
  "discount_amount": "e.g. 30% off one time" or null
}

Only return event_type "cancellation" or "discount_accepted". 
If the message is anything else (a bot message, a thread reply, a system message), return event_type "other".`;

    try {
        let responseText = '';

        if (GROQ_API_KEY) {
            const groq = new Groq({ apiKey: GROQ_API_KEY });
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
            });
            responseText = completion.choices[0]?.message?.content || '';
        } else if (GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            event_type: { type: Type.STRING },
                            customer_email: { type: Type.STRING, nullable: true },
                            plan_amount_dollars: { type: Type.NUMBER, nullable: true },
                            customer_since: { type: Type.STRING, nullable: true },
                            feedback: { type: Type.STRING, nullable: true },
                            survey_response: { type: Type.STRING, nullable: true },
                            discount_amount: { type: Type.STRING, nullable: true },
                        },
                        required: ["event_type"]
                    }
                }
            });
            responseText = response.text || '';
        }

        if (!responseText) return null;
        return JSON.parse(responseText);
    } catch (error) {
        console.error("Failed to parse AI parse response", error);
        return null;
    }
}

export async function scoreChurnReason(feedback: string | null, surveyResponse: string | null, planAmountDollars: number | null) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
        throw new Error("No AI API key found. Please set GEMINI_API_KEY or GROQ_API_KEY.");
    }
    const prompt = `You are a churn analyst for imagine.art, an AI image generation platform.

A user has just cancelled their subscription. Here is their data:
- Feedback: ${feedback || 'null'}
- Survey response: ${surveyResponse || 'null'}
- Plan value: ${planAmountDollars ? `$${planAmountDollars}/mo` : 'Unknown'}

Decide if this user is worth sending a win-back email to.

PASS (worth emailing) if ANY of the following are true:
- They are a high-value subscriber (e.g., paying $30/mo or more), REGARDLESS of how bland their feedback is.
- They mention switching to a specific competitor (ChatGPT, Midjourney, Adobe Firefly, Canva, etc.)
- They cite a specific missing feature or workflow that an image generation tool could address
- Their feedback is detailed and actionable

FAIL (not worth emailing) if:
- Feedback is vague ("not for me", "don't need it anymore", "no longer needed")
- No feedback was given at all
- Pure price complaint with no other context

Respond in JSON only, no markdown, no backticks:
{
  "pass": true or false,
  "reason": "one sentence explanation of your decision"
}
`;

    try {
        let responseText = '';

        if (GROQ_API_KEY) {
            const groq = new Groq({ apiKey: GROQ_API_KEY });
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
            });
            responseText = completion.choices[0]?.message?.content || '';
        } else if (GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            pass: { type: Type.BOOLEAN },
                            reason: { type: Type.STRING },
                        },
                        required: ["pass", "reason"]
                    }
                }
            });
            responseText = response.text || '';
        }

        if (!responseText) return null;
        return JSON.parse(responseText);
    } catch (error) {
        console.error("Failed to parse AI score response", error);
        return null;
    }
}

export async function draftWinBackEmail(
    customerEmail: string,
    feedback: string | null,
    surveyResponse: string | null,
    planAmountDollars: number | null
) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
        throw new Error("No AI API key found. Please set GEMINI_API_KEY or GROQ_API_KEY.");
    }

    const prompt = `You are writing a win-back email on behalf of Danish Haroon, Associate Product Manager at Imagine.Art (an AI image generation platform).

A user (${customerEmail}) just cancelled their ${planAmountDollars ? `$${planAmountDollars}/month` : ''} subscription. Here is what they said:
- Feedback: ${feedback || 'None provided'}
- Survey response: ${surveyResponse || 'None provided'}

Write a short, warm, personal email that:
1. Introduces Danish by name and role
2. Acknowledges their SPECIFIC feedback (do NOT be generic -- reference exactly what they said)
3. Explains that the team takes this seriously and is working to improve
4. If the user's complaint relates to lack of features, quality of outputs, limited credits, wanting to explore more, or anything that could be alleviated by having more credits to experiment with, mention that we would love to offer them ${planAmountDollars && planAmountDollars >= 100 ? '10,000' : '5,000'} free credits if they are willing to give Imagine.Art a second chance. Frame this naturally as "we would love to offer you X credits on us so you can re-explore the platform" -- do NOT make it feel transactional or desperate. If their complaint is purely about price, billing, or switching to a competitor for non-feature reasons, do NOT mention the credit offer.
5. Invites them to a 15-20 minute call: https://calendly.com/danish-haroon-imagine/new-meeting
6. Ends warmly, expressing hope they'll reconsider Imagine.Art in the future
7. MUST end with this EXACT signature format on separate lines:
"Best regards,
Danish Haroon
Associate Product Manager
Imagine.Art"

Tone guidelines:
- Professional but genuinely warm and human
- NOT salesy or desperate
- The goal is to learn from their feedback and build a relationship, not hard-sell
- Keep it concise (under 150 words for the body)
- NEVER use em dashes (—) anywhere in the email EVER (this is a critical requirement). Use commas, periods, or semicolons instead.
- If the customer's name is not clearly identifiable from their email address and feedback, do NOT use a name or any [Name] placeholders. In such cases, use "Hi," as the salutation and keep the subject line general.
- NEVER leave any [brackets] or [Name] placeholders in your output. Even if you don't know the name, write as if you don't need a name.

Respond in JSON only, no markdown, no backticks:
{
  "subject": "email subject line",
  "body": "full email body text (use \\n for line breaks)"
}`;

    try {
        let responseText = '';

        if (GROQ_API_KEY) {
            const groq = new Groq({ apiKey: GROQ_API_KEY });
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'qwen/qwen3-32b',
                temperature: 0.6,
                max_completion_tokens: 4096,
                top_p: 0.95,
                response_format: { type: 'json_object' },
            });
            responseText = completion.choices[0]?.message?.content || '';
        } else if (GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            subject: { type: Type.STRING },
                            body: { type: Type.STRING },
                        },
                        required: ["subject", "body"]
                    }
                }
            });
            responseText = response.text || '';
        }

        if (!responseText) return null;
        return JSON.parse(responseText);
    } catch (error) {
        console.error("Failed to generate win-back email draft", error);
        return null;
    }
}
