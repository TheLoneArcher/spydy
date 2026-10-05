import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { title, description, lat, lon, category } = await req.json();

    if (!lat || !lon) {
      return NextResponse.json({ error: 'Location (lat, lon) is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: nearbyReports, error } = await supabase.rpc('open_reports_within', {
      p_lat: lat,
      p_lon: lon,
      p_radius_m: 500,
      p_category: category || null,
    });

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch existing reports' }, { status: 500 });
    }

    if (!nearbyReports || nearbyReports.length === 0) {
      return NextResponse.json({ isDuplicate: false, duplicateOf: null, similarity: 0, existingReports: [] });
    }

    const validReports = nearbyReports ?? [];

    if (validReports.length === 0) {
      return NextResponse.json({ isDuplicate: false, duplicateOf: null, similarity: 0, existingReports: [] });
    }

    // Ask AI if it's a duplicate
    const messages = [
      {
        role: 'system',
        content: `You are an AI assistant helping to detect duplicate civic issue reports.
You will be provided with a new report and a list of existing nearby reports of the same category.
Determine if the new report is likely a duplicate of any existing report based on title and description.
Respond ONLY with a valid JSON object matching this schema:
{
  "isDuplicate": boolean,
  "duplicateOf": string | null (the id of the existing report, if duplicate),
  "similarity": number (0-1 score representing confidence of duplication)
}`
      },
      {
        role: 'user',
        content: `New Report:
Title: ${title}
Description: ${description}

Existing Reports:
${JSON.stringify(validReports, null, 2)}`
      }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: messages,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter duplicate detection error:', errorText);
      return NextResponse.json({ error: 'Failed to detect duplicates' }, { status: 500 });
    }

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content || '{}';
    
    try {
      const result = JSON.parse(resultText);
      return NextResponse.json({ ...result, existingReports: validReports });
    } catch (parseError) {
      console.error('Failed to parse OpenRouter response:', resultText);
      return NextResponse.json({ error: 'Invalid response from AI model' }, { status: 500 });
    }

  } catch (error) {
    console.error('Duplicate detection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
