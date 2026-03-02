import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Check API key endpoint
  app.get("/api/check-key", async (req, res) => {
    const headerApiKey = req.headers['x-api-key'] as string;
    const apiKey = headerApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ active: false, message: "No API key provided" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Say 'active'",
        config: {
          maxOutputTokens: 10,
        }
      });
      
      if (response.text && response.text.toLowerCase().includes("active")) {
        return res.json({ active: true });
      } else {
        return res.json({ active: true, message: "Key is working but response was unexpected" });
      }
    } catch (error: any) {
      console.error("API key check failed:", error);
      const isRateLimit = error.status === 429 || error.code === 429 || (error.message && error.message.includes("429"));
      const isInvalidKey = error.status === 401 || error.code === 401 || (error.message && error.message.toLowerCase().includes("api key"));
      
      return res.status(error.status || 500).json({ 
        active: false, 
        error: isRateLimit ? "Quota Exceeded" : isInvalidKey ? "Invalid API Key" : "Connection Failed",
        details: error.message
      });
    }
  });

  // Processing endpoint
  app.post("/api/process", async (req, res) => {
    const { type, content, mimeType } = req.body;
    const headerApiKey = req.headers['x-api-key'] as string;
    
    const apiKey = headerApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Fallback to mock data if no API key is available at all
      return res.json({
        isMock: true,
        id: Math.random().toString(36).substr(2, 9),
        transcript: [
          { start: 0, end: 5, text: "Welcome to the future of content creation.", tag: "HOOK", score: 95 },
          { start: 5, end: 15, text: "In this video, we'll explore how AI is changing everything for video editors.", tag: "INSIGHT", score: 80 },
          { start: 15, end: 25, text: "Imagine being able to extract the best moments in seconds instead of hours.", tag: "HOOK", score: 90 },
          { start: 25, end: 30, text: "...", tag: "SILENCE", score: 0 },
          { start: 30, end: 45, text: "The core problem is that clippers waste hours scrubbing through long videos.", tag: "STORY", score: 75 },
          { start: 45, end: 60, text: "Our system automatically detects hooks, insights, and emotional peaks.", tag: "DATA", score: 85 },
        ],
        clips: [
          { id: 1, start: 0, end: 25, title: "The Future of Content Creation", score: 92 },
          { id: 2, start: 30, end: 60, title: "Solving the Clipper's Problem", score: 88 },
        ]
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";
      
      let contents: any;
      const systemInstruction = `
        You are a world-class video editor, content strategist, and expert transcriber.
        Your task is to analyze video/audio content and provide a highly accurate, timestamped transcript and viral analysis.
        
        For the transcript:
        - Break content into logical segments (usually 5-15 seconds each).
        - Ensure timestamps are precise to the second.
        - Transcribe the text verbatim, including important pauses or emotional cues if they add value.
        - Assign a tag: HOOK (attention-grabbing), INSIGHT (valuable info), STORY (narrative), DATA (facts/stats), SILENCE, or FILLER.
        - Score each segment (0-100) based on its potential to keep a viewer engaged.
        
        For viral clips:
        - Identify 3-5 segments (20-60 seconds) with high viral potential.
        - These clips should be self-contained stories or powerful insights that work well on TikTok, Reels, or Shorts.
        - Create catchy, click-worthy titles that spark curiosity.
        - Provide a viral potential score (0-100) based on current social media trends.
        
        Always return valid JSON following the provided schema. If you use tools, integrate the information seamlessly into your analysis.
      `;
      
      if (type === 'optimized-video') {
        const { audio, frame } = req.body;
        contents = {
          parts: [
            { inlineData: { data: audio, mimeType: 'audio/wav' } },
            { inlineData: { data: frame, mimeType: 'image/jpeg' } },
            { text: "Analyze this audio and the provided video frame for transcript and viral clips." }
          ]
        };
      } else if (type === 'video') {
        contents = {
          parts: [
            { inlineData: { data: content, mimeType: mimeType || 'video/mp4' } },
            { text: "Analyze this video for transcript and viral clips." }
          ]
        };
      } else {
        contents = {
          parts: [
            { text: `Analyze the following ${type} content: "${content}". If it's a URL, use your tools to access it.` }
          ]
        };
      }

      // Retry logic for 429 errors
      const MAX_RETRIES = 3;
      let retryCount = 0;
      let result;

      while (retryCount <= MAX_RETRIES) {
        try {
          result = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0, // More deterministic for transcription
              tools: type !== 'video' && type !== 'optimized-video' ? [{ googleSearch: {} }, { urlContext: {} }] : [],
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
          break; // Success, exit retry loop
        } catch (err: any) {
          const isRateLimit = err.status === 429 || err.code === 429 || (err.message && err.message.includes("429"));
          if (isRateLimit && retryCount < MAX_RETRIES) {
            retryCount++;
            const waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            console.log(`Rate limit hit. Retrying in ${Math.round(waitTime)}ms (Attempt ${retryCount}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw err; // Re-throw if not a rate limit or max retries reached
        }
      }

      if (!result) throw new Error("Failed to generate content after retries");

      res.json(JSON.parse(result.text));
    } catch (error: any) {
      console.error("Gemini processing failed:", error);
      
      let status = 500;
      let errorMessage = "Processing failed";

      // Handle @google/genai ApiError structure
      if (error.status === 429 || error.code === 429 || (error.message && error.message.includes("429"))) {
        status = 429;
        errorMessage = "Quota Exceeded: You have reached your Gemini API limit. Please check your billing details or try again later.";
      } else if (error.status === 401 || error.code === 401 || (error.message && error.message.toLowerCase().includes("api key"))) {
        status = 401;
        errorMessage = "Invalid API Key: Please check your Gemini API key.";
      } else {
        errorMessage = error.message || "An unexpected error occurred during processing.";
      }
      
      res.status(status).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
