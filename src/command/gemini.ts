import type { ChatInputCommandInteraction } from 'discord.js';
import type { GoogleGenAI , Content , Tool } from '@google/genai';
import type { Guild } from '../guild.js';

const MAXDISCORDMESSAGELENGTH = 2000;

// --- Section to determine if prompt requires web search ---

const CONVERSATIONAL_FILLERS_REGEX = /^\s*(?:hi|hello|hey|thanks|thank you|ok(?:ay)?|yes|no|bye|good\s?(?:morning|afternoon|evening|night|luck))\W*\s*$/i;
const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/i;

const SEARCH_TRIGGERS_REGEX = new RegExp(
    '\\b(?:' +
    'latest|current|live|updat(?:e|ed|es)|breaking|recent|newest|fresh|trending|' +
    'today|now|currently|tonight|yesterday|tomorrow|this\\s+(?:week|month|year)|' +
    'weather(?:\\s+(?:in|for))?|forecast(?:\\s+for)?|temperature(?:\\s+in)?|' +
    'news(?:\\s+(?:about|on|from))?|' +
    '(?:statistic(?:s)?|population|data|cases)(?:\\s+(?:for|of|on|about))|' +
    'what\\s+time\\s+is\\s+it\\s+in' +
    ')\\b', 'i'
);

const RECENT_OR_FUTURE_YEAR_REGEX = /\b(202[4-9]|203\d)\b/; // Example: 2024-2039 (current year: 2025)
const HISTORICAL_CONTEXT_FOR_YEAR_REGEX = /\b(history of|historical|in the year|born in|founded in|set in the year|world war)\b/i;
const CREATIVE_TASK_FOR_YEAR_REGEX = /^\s*(write|create|tell|generate|imagine|draft|story set in|plan a trip in)\b/i;

const SIMPLE_TASK_REGEX = new RegExp(
    '^(?:\\s*(?:' +
    'write|create|tell|generate|imagine|draft|compose' +
    ')\\s+(?:a|an|some|me|my)\\s+(?:story|poem|joke|song|list|ideas|email|code|script|dialogue|haiku|limerick|essay|summary|letter|tagline)|' +
    '\\s*(?:summarize|rephrase|explain|describe)\\s+(?:this|the following text|the concept of|what|how|why)|' +
    '\\s*(?:translate|convert)\\s+(?:"[^"]+"|\'[^\']+\'|[\\w\\s]+)\\s+(?:to|into)\\s+[\\w\\s]+|' +
    '\\s*(?:define|what is the meaning of|what does\\s+(?:"[^"]+"|\'[^\']+\'|(?:[a-zA-Z\'-]+(?:\\s+[a-zA-Z\'-]+){0,3}))\\s+mean)|' +
    '\\s*(?:calculate|what is|compute)\\s+([\\d%().+\\-*\\/\\^\\s]+[\\d%().+\\-*\\/\\^])$|' +
    '\\s*(?:how do you spell|spell(?: the word)?)\\s+[\\w\'-]+|' +
    '\\s*(?:give me an example of|list some types of)|' +
    '\\s*(?:what(?:s| is))\\s+(?:another word for|the opposite of)\\s+[\\w\'-]+' +
    ')\\b', 'i'
);

const GENERAL_QUESTION_STARTER_REGEX = /^\s*(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did)/i;
// Regex to extract the object part of a general question more reliably
const GENERAL_QUESTION_OBJECT_EXTRACTOR_REGEX = /^\s*(?:what|who|where|when|why|how)\s+(?:is|are|was|were|do|does|did)(?:\s+(?:a|an|the|some))?\s+(.+?)(?:\s+in\b|\s+on\b|\s+during\b|\s+at\b|\s+by\b|\s+with\b|\s+from\b|\s+about\b|\?)?\s*$/i;


/**
 * Determines whether a given prompt is likely to require a web search to be
 * successfully answered. This function uses a combination of heuristics and
 * regular expressions to analyze the prompt and make a decision. The order of
 * checks is designed to be fastest and most decisive first.
 * The function returns `true` if a search is likely required and `false` if it is not.
 *
 * @param {string} promptText - The text of the prompt to be analyzed.
 * @returns {boolean} Whether a search is likely required to answer the prompt.
 */
export function isWebSearchRequired(promptText: string): boolean {
    const lowerPrompt = promptText.toLowerCase().trim();

    // 1. Very short conversational fillers (NO SEARCH)
    if (lowerPrompt.length < 12 && CONVERSATIONAL_FILLERS_REGEX.test(lowerPrompt)) {
        return false;
    }

    // 2. Explicit URL processing (SEARCH REQUIRED)
    if (URL_REGEX.test(lowerPrompt)) {
        return true;
    }

    // 3. Strong "Search Required" keywords/patterns (SEARCH REQUIRED)
    if (SEARCH_TRIGGERS_REGEX.test(lowerPrompt)) {
        return true;
    }

    // 4. Recent/Future Year Check (SEARCH REQUIRED if not clearly historical/creative task)
    if (RECENT_OR_FUTURE_YEAR_REGEX.test(lowerPrompt)) {
        if (!HISTORICAL_CONTEXT_FOR_YEAR_REGEX.test(lowerPrompt) && !CREATIVE_TASK_FOR_YEAR_REGEX.test(lowerPrompt)) {
            return true;
        }
    }

    // 5. Simple Self-Contained LLM Tasks (NO SEARCH)
    if (SIMPLE_TASK_REGEX.test(lowerPrompt)) {
        if (/^\s*(summarize|rephrase|explain|describe)/i.test(lowerPrompt)) {
            const execResult = /^\s*(?:summarize|rephrase|explain|describe)\s+(?:this|the following text|the concept of|what|how|why)\s+(.*)/i.exec(lowerPrompt);
            const objectOfTask = execResult?.[1] ?? ""; // Using optional chaining and nullish coalescing
            if (objectOfTask && SEARCH_TRIGGERS_REGEX.test(objectOfTask)) {
                return true;
            }
        }
        return false;
    }

    // 6. General Knowledge Questions (NO SEARCH if object is truly general, otherwise SEARCH)
    if (GENERAL_QUESTION_STARTER_REGEX.test(lowerPrompt)) {
        const execResult = GENERAL_QUESTION_OBJECT_EXTRACTOR_REGEX.exec(lowerPrompt);
        const questionObject = execResult?.[1]?.trim() ?? ""; // Using optional chaining

        if (questionObject) {
            if (SEARCH_TRIGGERS_REGEX.test(questionObject)) {
                return true;
            }
            if (
                questionObject.includes('_') ||
                /[a-z]\d[a-z]|\d[a-z]\d/i.test(questionObject) ||
                /"[^"]{4,}"/.test(questionObject) || /'[^']{4,}'/.test(questionObject)
            ) {
                return true;
            }

            const originalPromptExecResult = GENERAL_QUESTION_OBJECT_EXTRACTOR_REGEX.exec(promptText); // Use original promptText for casing
            const originalObjectText = originalPromptExecResult?.[1]?.trim() ?? "";

            if (originalObjectText) {
                const wordsInObject = originalObjectText.split(/\s+/);
                let capitalWordCount = 0;
                if (wordsInObject.length > 1) {
                    for (const word of wordsInObject) {
                        if (word.length > 1 && /^[A-Z]/.test(word[0]) && !(word.length <= 3 && word === word.toUpperCase())) {
                            capitalWordCount++;
                        }
                    }
                }
                if (capitalWordCount >= 2) {
                    return true;
                }
            }
            
            if (questionObject.split(/\s+/).length > 6) {
                return true;
            }
            return false;
        }
        return true; // Default for poorly formed/complex general questions
    }
    return true; // Default for ambiguity
}


export function geminiHandler(googleGenAi: Readonly<GoogleGenAI> | undefined) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (googleGenAi === undefined) {
      await interaction.reply('Gemini command is not available in this server.');
      return;
    }

    const defer = interaction.deferReply();
    try {
      const prompt = String(interaction.options.get('prompt')?.value).trim();
      
      // --- Extra (local) In-context Data to add to model ---
      // Just an example - We are also able to add in-context information thru fetching files from database that we add to the botgege
      // Some basic grounding rules for LLM
      const grounding = `
        Output Guidelines:
        - Ensure no real names or personal information are included.
        - Respond naturally to the user without referencing these specific instructions.
        - External Info Synthesis: MAXIMUM CONDENSATION. If web search results are used, extract ONLY the absolute, critical facts—nothing more—that directly answer the user's specific query. Present these as stripped-down, telegraphic key points. Every single word is an expense; eliminate all non-essential language, context, or elaboration.
        `;

      // Check if web search is required
      const search = isWebSearchRequired(prompt);
      console.log('Gemini using web search: ', search);

      // Append (local) grounding data and the user's prompt
      const fullPrompt: Content[] = [ // Use Content[] for structured input
        { role: "user", parts: [{ text: `${grounding}\n\nUser message: ${prompt}` }] }
      ];

      const googleSearchTool: Tool = {
        googleSearch: {
        },
      };
      
      // 1 token is around 4 english characters
      const response = await googleGenAi.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: fullPrompt,
        config: {
          maxOutputTokens: 500, // Maximum number of tokens to generate for request
          temperature: 0.383838383838383, // Degree of Randomness, 0.0-1.0
          tools: search ? [googleSearchTool] : [], // set whether google search is used. Uses more tokens as a result
        }
      });

      await defer;
      const messageContent = response.text;

      if (messageContent === undefined) {
        console.log('Resonse not returned, running again: ', response);
        
        await interaction.editReply('Gemini was unable to process your prompt.Try including more details in your query.');
        return;
      }

      const reply =
        messageContent.length > MAXDISCORDMESSAGELENGTH
          ? messageContent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...'
          : messageContent;
      await defer;
      await interaction.editReply(reply);
    } catch (error) {
      console.log(`Error at gemini --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to Gemini.');
    }
  };
}
