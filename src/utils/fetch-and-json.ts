import fetch, { type RequestInit } from 'node-fetch';

export const fetchAndJson = async (emoteEndpoint: string, options?: RequestInit): Promise<unknown> => {
  return options ? await (await fetch(emoteEndpoint, options)).json() : await (await fetch(emoteEndpoint)).json();
};
