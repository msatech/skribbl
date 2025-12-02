
'use client';
import { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';

type AudioContextType = {
  playSound: (sound: 'join' | 'leave' | 'correct_guess' | 'time_up' | 'game_over') => void;
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const audioFiles = useMemo(() => {
    if (typeof window === 'undefined') return {};
    return {
      join: new Audio('/sounds/join.mp3'),
      leave: new Audio('/sounds/leave.mp3'),
      correct_guess: new Audio('/sounds/correct.mp3'),
      time_up: new Audio('/sounds/time-up.mp3'),
      game_over: new Audio('/sounds/game-over.mp3'),
    };
  }, []);

  const playSound = useCallback((sound: keyof typeof audioFiles) => {
    const audio = audioFiles[sound];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(error => console.error(`Error playing sound: ${sound}`, error));
    }
  }, [audioFiles]);

  const value = useMemo(() => ({ playSound }), [playSound]);

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};

    