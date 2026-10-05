import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { title, description, imageUrl } = await req.json();

    if (!title && !description && !imageUrl) {
      return NextResponse.json({ error: 'Title, description, or a camera image is required' }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI categorization is not configured on the server' }, { status: 503 });
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `You are an AI assistant for a civic issue reporting platform. 
Categorize the reported issue based on the provided title, description, and optional image.
Respond ONLY with a valid JSON object matching this schema:
{
  "category": "pothole" | "streetlight" | "garbage" | "water_leakage" | "road_damage" | "drainage" | "other",
  "severity": "critical" | "moderate" | "low",
  "confidence": number (between 0 and 1),
  "suggested_title": string (a concise, clear title based on the input)
}`
      }
    ];

    const content: any[] = [];
    if (title || description) {
      content.push({
        type: 'text',
        text: `Title: ${title || 'N/A'}\nDescription: ${description || 'N/A'}`
      });
    } else {
      content.push({ type: 'text', text: 'Analyze the captured civic issue image.' });
    }

    if (imageUrl) {
      content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl
        }
      });
    }

    messages.push({
      role: 'user',
      content: content
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
        messages: messages,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      let providerMessage = `OpenRouter returned ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        providerMessage = parsed.error?.message || providerMessage;
      } catch {}
      return NextResponse.json({ error: `AI categorization failed: ${providerMessage}` }, { status: 502 });
    }

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content || '{}';
    
    try {
      const result = JSON.parse(resultText);
      const categories = ['pothole', 'streetlight', 'garbage', 'water_leakage', 'road_damage', 'drainage', 'other'];
      const severities = ['critical', 'moderate', 'low'];
      return NextResponse.json({
        category: categories.includes(result.category) ? result.category : 'other',
        severity: severities.includes(result.severity) ? result.severity : 'moderate',
        confidence: typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0,
        suggested_title: typeof result.suggested_title === 'string' ? result.suggested_title.slice(0, 140) : '',
      });
    } catch (parseError) {
      console.error('Failed to parse OpenRouter response:', resultText);
      return NextResponse.json({ error: 'Invalid response from AI model' }, { status: 500 });
    }
  } catch (error) {
    console.error('Categorize API error:', error);
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'AI categorization timed out. Try again or choose a category manually.'
      : 'AI categorization could not be completed. Choose a category manually.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
