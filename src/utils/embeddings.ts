/** @format */

import { config } from '../config.js';

type OllamaEmbeddingsResponse = {
  embedding?: number[];
};

/**
 * Generate a vector embedding for a piece of text using the local Ollama model.
 * Returns a float array representing the text's position in semantic space.
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${config.ollama.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.embeddingModel,
      prompt: text
    })
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as OllamaEmbeddingsResponse;

  if (!data.embedding) {
    throw new Error('Ollama returned no embedding. Is the model pulled?');
  }

  return data.embedding;
}
