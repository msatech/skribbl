'use server';

/**
 * @fileOverview Generates suggested room names using GenAI.
 *
 * - generateSuggestedRoomName - A function that generates a suggested room name.
 * - SuggestedRoomNameInput - The input type for the generateSuggestedRoomName function.
 * - SuggestedRoomNameOutput - The return type for the generateSuggestedRoomName function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const SuggestedRoomNameInputSchema = z.object({
  theme: z
    .string()
    .optional()
    .describe('Optional theme for the room name, e.g., a specific topic or interest.'),
});
export type SuggestedRoomNameInput = z.infer<typeof SuggestedRoomNameInputSchema>;

const SuggestedRoomNameOutputSchema = z.object({
  roomName: z.string().describe('A suggested room name.'),
});
export type SuggestedRoomNameOutput = z.infer<typeof SuggestedRoomNameOutputSchema>;

export async function generateSuggestedRoomName(
  input: SuggestedRoomNameInput
): Promise<SuggestedRoomNameOutput> {
  return suggestedRoomNameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestedRoomNamePrompt',
  input: {schema: SuggestedRoomNameInputSchema},
  output: {schema: SuggestedRoomNameOutputSchema},
  prompt: `You are a creative room name generator. Generate a fun and engaging room name.

  {% if theme %}The theme is: {{theme}}.{% endif %}

  Room name:`,
});

const suggestedRoomNameFlow = ai.defineFlow(
  {
    name: 'suggestedRoomNameFlow',
    inputSchema: SuggestedRoomNameInputSchema,
    outputSchema: SuggestedRoomNameOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
