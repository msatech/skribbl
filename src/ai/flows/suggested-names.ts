'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting fun and creative nicknames and room names using GenAI.
 *
 * The flow uses a prompt to generate names based on a specified category (either 'nickname' or 'room name').
 * - generateSuggestion - A function that generates a name suggestion.
 * - NameType - The input type for the generateSuggestion function.
 * - NameSuggestionOutput - The return type for the generateSuggestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const NameTypeSchema = z.object({
  category: z.enum(['nickname', 'room name']).describe('The category of name to generate: nickname or room name.'),
});
export type NameType = z.infer<typeof NameTypeSchema>;

const NameSuggestionOutputSchema = z.object({
  suggestion: z.string().describe('A fun and creative name suggestion.'),
});
export type NameSuggestionOutput = z.infer<typeof NameSuggestionOutputSchema>;

export async function generateSuggestion(input: NameType): Promise<NameSuggestionOutput> {
  return generateSuggestionFlow(input);
}

const namePrompt = ai.definePrompt({
  name: 'namePrompt',
  input: {schema: NameTypeSchema},
  output: {schema: NameSuggestionOutputSchema},
  prompt: `You are a creative name generator. Generate a fun and catchy name for a {{category}}. The name should be short, memorable, and relevant to a drawing and guessing game like Skribbl.io. Be unpredictable.

Suggestion:`,
});

const generateSuggestionFlow = ai.defineFlow(
  {
    name: 'generateSuggestionFlow',
    inputSchema: NameTypeSchema,
    outputSchema: NameSuggestionOutputSchema,
  },
  async input => {
    const {output} = await namePrompt(input);
    return output!;
  }
);
