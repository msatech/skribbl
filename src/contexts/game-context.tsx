
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useGameEngine } from '@/hooks/use-game-engine';
import type { GameSettings, Player } from '@/types';
import type { DrawingAction } from '@/app/(game)/room/[roomId]/canvas';

// The return type of the hook, which will be the shape of our context
type GameContextType = ReturnType<typeof useGameEngine>;

const GameContext = createContext<GameContextType | null>(null);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

export const GameProvider = ({ children }: { children: React.Node }) => {
  const gameEngine = useGameEngine();

  return (
    <GameContext.Provider value={gameEngine}>
      {children}
    </GameContext.Provider>
  );
};
