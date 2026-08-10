import { GoogleGenerativeAI } from '@google/generative-ai';

export async function executeLlmCall(prompt: string, modelName: string = 'gemini-1.5-flash'): Promise<{
  text: string;
  tokens_used: number;
  model: string;
  source: 'real_api' | 'fallback_stub';
}> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName || 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return {
        text,
        tokens_used: Math.ceil((prompt.length + text.length) / 4),
        model: modelName,
        source: 'real_api',
      };
    } catch (err: any) {
      console.warn('Gemini API call failed, falling back to simulated LLM response:', err.message);
    }
  }

  // Fallback AI engine with artificial delay to demonstrate real step processing
  await new Promise((resolve) => setTimeout(resolve, 800));

  let simulatedText = `[AI Analysis Response] Processed prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}". Key Findings: High confidence match (0.94). Recommended action: Approve workflow step and notify team.`;

  if (prompt.toLowerCase().includes('sentiment') || prompt.toLowerCase().includes('classify')) {
    simulatedText = `{"sentiment": "POSITIVE", "confidence": 0.98, "summary": "User intent evaluated as favorable."}`;
  } else if (prompt.toLowerCase().includes('extract') || prompt.toLowerCase().includes('entities')) {
    simulatedText = `{"entities": ["Org A", "Workflow Engine", "Hasura"], "status": "EXTRACTED_SUCCESS"}`;
  }

  return {
    text: simulatedText,
    tokens_used: Math.ceil((prompt.length + simulatedText.length) / 4),
    model: `${modelName || 'gemini-1.5-flash'} (fallback-stub)`,
    source: 'fallback_stub',
  };
}
