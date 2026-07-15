/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Lazy-loaded Gemini Client
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required. Please add your key in Settings > Secrets.');
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Configure JSON limit for base64 screen images
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health check API
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Screen context analysis chat endpoint
  app.post('/api/chat-analyze', async (req, res) => {
    try {
      const { message, history, screens } = req.body;
      const ai = getGeminiClient();

      const contents: any[] = [];

      // 1. Map history to Gemini API format if provided
      if (history && Array.isArray(history)) {
        history.forEach((turn: any) => {
          if (turn.sender === 'user') {
            contents.push({
              role: 'user',
              parts: [{ text: turn.text }]
            });
          } else if (turn.sender === 'assistant') {
            contents.push({
              role: 'model',
              parts: [{ text: turn.text }]
            });
          }
        });
      }

      // 2. Build the latest user message
      const latestParts: any[] = [];

      // If active screen streams were captured, convert them into inlineData parts
      if (screens && Array.isArray(screens)) {
        screens.forEach((screen: any) => {
          if (screen.base64) {
            const matches = screen.base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const mimeType = matches[1];
              const data = matches[2];
              latestParts.push({
                inlineData: {
                  mimeType,
                  data
                }
              });
              latestParts.push({
                text: `[Active Screen Context: Visual frame of "${screen.label}"]`
              });
            }
          }
        });
      }

      // Add the user's typed message
      latestParts.push({
        text: message || "Analyze the current screen feeds and provide a general summary of what you see."
      });

      contents.push({
        role: 'user',
        parts: latestParts
      });

      // Generate context-aware response using gemini-3.5-flash
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          systemInstruction: `You are Screen Stream AI, an elite context-aware coding copilot, full-stack architect, and SaaS product assistant.
You are helping a builder developer. You have access to real-time image frames of their active screen streams.
Each screen is labeled (e.g. "Screen 1").
Use this visual context to help them build code, design SaaS apps, debug errors, explain UI layouts, and answer questions.
Be highly practical, specific, and write complete, fully-formed, production-ready code blocks (TypeScript, Tailwind CSS, React, etc.) where appropriate.
Directly refer to the screens in your dialogue (e.g., "On Screen Stream: 'Backend Code', I notice a missing await...") so the user knows you see their stream.`
        }
      });

      const reply = response.text || "I apologize, I was unable to analyze your screens.";
      res.json({ text: reply });

    } catch (error: any) {
      console.error('Chat analyze error:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze screens with Gemini.' });
    }
  });

  // Screen Context Notification Scanner
  app.post('/api/scan-context', async (req, res) => {
    try {
      const { screens } = req.body;
      if (!screens || !Array.isArray(screens) || screens.length === 0) {
        return res.json({ notification: "No active screen streams detected to scan." });
      }

      const ai = getGeminiClient();
      const parts: any[] = [];

      screens.forEach((screen: any) => {
        if (screen.base64) {
          const matches = screen.base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            parts.push({
              inlineData: {
                mimeType: matches[1],
                data: matches[2]
              }
            });
            parts.push({
              text: `[Active Screen: "${screen.label}"]`
            });
          }
        }
      });

      parts.push({
        text: "Analyze these active screen stream(s) and write a single, highly engaging, professional developer notification (maximum 1-2 sentences) summarizing what you see on the screen(s) and how you can help. Format it as an alert notification. Example: 'I notice you're editing a React layout on Screen 1. Let me know if you need help styling this with Tailwind!'. Keep it short, natural, and helpful."
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: parts,
        config: {
          systemInstruction: "You are Screen Stream AI. You generate short, active, context-aware notification updates based on what the user is working on."
        }
      });

      const notification = response.text?.trim() || "Active screens scanned successfully. Ask me anything about them!";
      res.json({ notification });

    } catch (error: any) {
      console.error('Scan context error:', error);
      res.status(500).json({ error: error.message || 'Failed to scan screen context.' });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
