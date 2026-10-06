import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import {
  classificationOutputSchema,
  classifyHeuristic,
  extractJsonFromResponse,
  getBestVisionModel,
  type ClassificationResult,
} from '@/lib/server/openrouter';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const classifyInputSchema = z.object({
  media_id: z.string().uuid().optional(),
  text: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const userClient = await getSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsedInput = classifyInputSchema.safeParse(body);
    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input. Provide media_id or text.' }, { status: 400 });
    }

    const { media_id, text } = parsedInput.data;
    if (!media_id && !text) {
      return NextResponse.json({ error: 'Either media_id or text description is required.' }, { status: 400 });
    }

    const adminClient = getSupabaseAdminClient();
    let imageBase64: string | null = null;
    let mediaRow: any = null;

    if (media_id) {
      const { data: media } = await adminClient
        .from('report_media')
        .select('*')
        .eq('id', media_id)
        .eq('uploaded_by', user.id)
        .single();

      if (media && media.storage_path) {
        mediaRow = media;
        // Download image bytes directly from private bucket (avoiding SSRF via URLs)
        const { data: fileData, error: downloadErr } = await adminClient.storage
          .from('report-media')
          .download(media.storage_path);

        if (!downloadErr && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          imageBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        }
      }
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // Fall back to heuristic if API key is not configured
    if (!apiKey) {
      const heuristicResult = classifyHeuristic(text || 'Civic infrastructure hazard reported');
      if (mediaRow) {
        await adminClient
          .from('report_media')
          .update({
            ai_label: heuristicResult,
            ai_confidence: heuristicResult.confidence,
            ai_model: 'heuristic',
          })
          .eq('id', mediaRow.id);
      }
      return NextResponse.json(heuristicResult);
    }

    // Call OpenRouter with selected free-tier vision model
    const modelToUse = await getBestVisionModel();
    const systemPrompt = `You are a municipal civic issue categorization AI for the Tirupati Civic Operations System.
Your job is to analyze citizen camera photos or text reports of civic issues.
Categories:
- "pothole": road surface craters, broken asphalt, pavement collapse
- "streetlight": dark luminaire, broken lamp, hanging street wire, lighting outage
- "garbage": overflowing bins, dumped commercial/domestic solid waste, litter piles
- "water_leak": broken drinking water pipes, spraying valves, main bursts, water stagnation
- "other": other public civic hazards

Respond ONLY with a valid JSON object matching this exact schema:
{
  "category": "pothole" | "streetlight" | "garbage" | "water_leak" | "other",
  "confidence": number between 0.0 and 1.0,
  "severity": "critical" | "moderate" | "low",
  "suggested_title": "concise title max 80 chars",
  "suggested_description": "summary description max 300 chars",
  "reasoning": "one sentence explaining the visual or textual evidence"
}`;

    const contentList: any[] = [];
    if (text) {
      contentList.push({ type: 'text', text: `Citizen Description: ${text}` });
    } else {
      contentList.push({ type: 'text', text: 'Analyze this verified field photograph of a civic hazard.' });
    }

    if (imageBase64) {
      contentList.push({
        type: 'image_url',
        image_url: { url: imageBase64 },
      });
    }

    async function callOpenRouter(temp: number) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://responsys.gov',
          'X-Title': 'ResponSys Civic Triage',
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentList },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
          temperature: temp,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter returned status ${response.status}`);
      }

      const resData = await response.json();
      const content = resData.choices?.[0]?.message?.content || '{}';
      return extractJsonFromResponse(content);
    }

    let parsedResult: ClassificationResult | null = null;

    try {
      const rawJson = await callOpenRouter(0.2);
      const validated = classificationOutputSchema.safeParse(rawJson);
      if (validated.success) {
        parsedResult = {
          ...validated.data,
          model_used: modelToUse,
          source: 'ai',
        };
      } else {
        // Retry once with temperature 0
        const retryJson = await callOpenRouter(0.0);
        const retryValidated = classificationOutputSchema.safeParse(retryJson);
        if (retryValidated.success) {
          parsedResult = {
            ...retryValidated.data,
            model_used: modelToUse,
            source: 'ai',
          };
        }
      }
    } catch (apiErr) {
      logger.warn('OpenRouter request failed, falling back to heuristic', apiErr);
    }

    // If AI failed or returned invalid schema, fall back gracefully to heuristic
    const finalResult: ClassificationResult =
      parsedResult || classifyHeuristic(text || 'Reported municipal civic issue');

    logger.info(`[Classifier: ${finalResult.source === 'ai' ? `OpenRouter (${finalResult.model_used})` : 'Heuristic'}] Category=${finalResult.category}`);

    // Update report_media audit trail if media was passed
    if (mediaRow) {
      await adminClient
        .from('report_media')
        .update({
          ai_label: finalResult,
          ai_confidence: finalResult.confidence,
          ai_model: finalResult.model_used,
        })
        .eq('id', mediaRow.id);
    }

    return NextResponse.json(finalResult);
  } catch (err: unknown) {
    logger.error('Error in POST /api/classify', err);
    // Never 500 to client
    const fallback = classifyHeuristic('Civic hazard report');
    return NextResponse.json(fallback);
  }
}
