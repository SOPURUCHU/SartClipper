import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  tag: "HOOK" | "INSIGHT" | "STORY" | "DATA" | "SILENCE" | "FILLER";
  score: number;
}

export interface ClipSuggestion {
  id: string;
  start: number;
  end: number;
  title: string;
  score: number;
}

export async function processContent(content: string, type: "text" | "video" | "audio") {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the following ${type} content and break it into timestamped segments.
    For each segment, provide:
    1. Start and end time (in seconds).
    2. The transcript text.
    3. A tag from: HOOK, INSIGHT, STORY, DATA, SILENCE, FILLER.
    4. A score (0-100) based on importance and engagement.
    
    Also, suggest 3-5 high-value clip candidates (20-60 seconds each) with a title and score.
    
    Content:
    ${content}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                text: { type: Type.STRING },
                tag: { type: Type.STRING },
                score: { type: Type.NUMBER },
              },
              required: ["start", "end", "text", "tag", "score"],
            },
          },
          clips: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                title: { type: Type.STRING },
                score: { type: Type.NUMBER },
              },
              required: ["id", "start", "end", "title", "score"],
            },
          },
        },
        required: ["transcript", "clips"],
      },
    },
  });

  return JSON.parse(response.text);
}
