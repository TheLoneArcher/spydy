import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Haversine formula to calculate distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

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

    // Fetch potential duplicates (same category, approx bounding box)
    // 1 degree lat is ~111km. 500m is ~0.0045 degrees.
    const latThreshold = 0.005;
    const lonThreshold = 0.005;

    const { data: nearbyReports, error } = await supabase
      .from('need_reports')
      .select('id, title, description, latitude, longitude, category, status')
      .eq('category', category)
      .gte('latitude', lat - latThreshold)
      .lte('latitude', lat + latThreshold)
      .gte('longitude', lon - lonThreshold)
      .lte('longitude', lon + lonThreshold)
      .neq('status', 'resolved')
      .limit(10);

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch existing reports' }, { status: 500 });
    }

    if (!nearbyReports || nearbyReports.length === 0) {
      return NextResponse.json({ isDuplicate: false, duplicateOf: null, similarity: 0, existingReports: [] });
    }

    // Filter by exact distance (< 500m)
    const validReports = nearbyReports.filter(report => {
      const distance = calculateDistance(lat, lon, report.latitude, report.longitude);
      return distance <= 0.5; // 500 meters
    });

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
