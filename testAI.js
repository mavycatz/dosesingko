import 'dotenv/config';
import fetch from 'node-fetch';

const HF_API_KEY = process.env.HF_API_KEY;

export const generateFeedbackReply = async (message) => {
  const modelUrl = "https://api-inference.huggingface.co/models/google/flan-t5-base";

  const response = await fetch(modelUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: message })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HF API error: ${text}`);
  }

  const data = await response.json();
  // Flan-T5 returns an array of { generated_text: "..." }
  return data?.[0]?.generated_text || "No reply generated";
};

// Test it
(async () => {
  try {
    const reply = await generateFeedbackReply(
      "Write a polite professional reply to a customer asking about delivery times."
    );
    console.log("AI Reply:", reply);
  } catch (err) {
    console.error("Error generating reply:", err);
  }
})();
