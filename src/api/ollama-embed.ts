/** @format */

import { config } from '../config.ts';

type OllamaEmbeddingsResponse = {
  readonly embedding?: readonly number[];
};

/**
 * Embed a piece of text via the local Ollama embeddings endpoint.
 * Single source of truth for the request shape — both the vector store's
 * RAG retrieval and the reply editor's recent-output similarity check
 * use this helper.
 */
export async function embed(text: string): Promise<readonly number[]> {
  const { baseUrl, embeddingModel } = config.ollama;
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embeddingModel, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaEmbeddingsResponse;
  if (!data.embedding) throw new Error('Ollama returned no embedding. Is the model pulled?');
  return data.embedding;
}
