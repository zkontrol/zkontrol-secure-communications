import OpenAI from "openai";

// OpenAI client configuration for ZKONTROL AI Assistant
const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export async function getCryptoAssistantResponse(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are ZKONTROL AI Assistant, a helpful cryptocurrency and Solana blockchain expert. 
          
Your role is to help users with:
- Crypto transactions and wallet management
- Real-time Solana market data and analysis
- Smart contract interactions
- Security best practices
- DeFi protocols on Solana
- NFT trading and marketplaces
- Token swaps and liquidity pools

Be concise, accurate, and friendly. Provide actionable advice. Always prioritize security and privacy.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_completion_tokens: 1024,
      temperature: 1,
    });
    
    return response.choices[0]?.message?.content || "I'm having trouble responding right now. Please try again.";
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to get AI response');
  }
}
