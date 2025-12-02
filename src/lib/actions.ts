'use server';

import { generateSuggestion } from '@/ai/flows/suggested-names';
import { generateSuggestedRoomName as generateRoomName } from '@/ai/flows/suggested-room-names';

export async function getSuggestedNickname() {
  const result = await generateSuggestion({ category: 'nickname' });
  return result.suggestion;
}

export async function getSuggestedRoomName(theme?: string) {
  const result = await generateRoomName({ theme });
  return result.roomName;
}
