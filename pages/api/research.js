import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { context } = req.body;

    // Validate input
    if (!context || typeof context !== 'string' || context.trim().length === 0) {
      return res.status(400).json({ error: 'Context is required' });
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // System prompt for contextual research
    const systemPrompt = `You are a research assistant that provides concise, factual information to complete sentences. 

When given a context with @Paradigm, analyze what specific information is needed and provide ONLY that information - no explanations, no extra text, no quotation marks.

Examples:
- "Sony was founded in @Paradigm" → 1946
- "The current CEO of Tesla is @Paradigm" → Elon Musk  
- "Apple's latest iPhone @Paradigm features" → 15
- "The population of Tokyo is @Paradigm" → 13.96 million
- "USA landed on the moon in @Paradigm" → 1969

Rules:
1. Return only the specific fact/data needed to complete the sentence
2. Do NOT use quotation marks around your response
3. Use current, accurate information when possible - search the web if needed
4. Be concise - typically 1-5 words
5. Only return "[unclear context]" if the sentence is genuinely incomprehensible or the request is completely ambiguous
6. Try to infer the most likely meaning from context even if it's not perfect`;

    // Call OpenAI API with standard GPT-4o model
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Context: "${context}"` }
      ],
      max_tokens: 50,
      temperature: 0.1
    });

    const result = completion.choices[0]?.message?.content?.trim();

    if (!result) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    // Return the research result
    return res.status(200).json({ 
      result: result
    });

  } catch (error) {
    console.error('Research API Error:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(429).json({ error: 'AI service quota exceeded. Please try again later.' });
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }

    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ error: 'Invalid AI service configuration.' });
    }

    // Generic error response
    return res.status(500).json({ 
      error: 'Failed to process research request. Please try again.' 
    });
  }
} 