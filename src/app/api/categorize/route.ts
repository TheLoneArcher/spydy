import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { title, description, imageUrl } = await req.json();

    if (!title && !description) {
      return NextResponse.json({ error: 'Title or description is required' }, { status: 400 });
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
        model: 'google/gemini-2.0-flash-001',
        messages: messages,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json({ error: 'Failed to categorize issue' }, { status: 500 });
    }

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content || '{}';
    
    try {
      const result = JSON.parse(resultText);
      return NextResponse.json(result);
    } catch (parseError) {
      console.error('Failed to parse OpenRouter response:', resultText);
      return NextResponse.json({ error: 'Invalid response from AI model' }, { status: 500 });
    }
  } catch (error) {
    console.error('Categorize API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
