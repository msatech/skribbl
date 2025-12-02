'use client';
import { createContext, useContext, useMemo, useCallback, ReactNode, useState, useEffect } from 'react';

export type Sound = 'join' | 'leave' | 'correct_guess' | 'time_up' | 'game_over' | 'new_round' | 'message';

type AudioContextType = {
  playSound: (sound: Sound) => void;
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

type AudioFiles = {
  [key in Sound]?: HTMLAudioElement;
};

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [audioFiles, setAudioFiles] = useState<AudioFiles>({});
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setAudioFiles({
          join: new Audio('/sounds/join.mp3'),
          leave: new Audio('/sounds/leave.mp3'),
          correct_guess: new Audio('/sounds/correct.mp3'),
          time_up: new Audio('/sounds/time-up.mp3'),
          game_over: new Audio('/sounds/game-over.mp3'),
          new_round: new Audio('/sounds/new-round.mp3'),
          message: new Audio('/sounds/message.mp3'),
        });
      } catch (error) {
        console.error("Error loading audio files:", error);
      }
    }
  }, []);

  const playSound = useCallback((sound: keyof AudioFiles) => {
    if (isMuted) return;

    const audio = audioFiles[sound];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(error => {
        // This can happen if the user hasn't interacted with the page yet.
        // It's a browser security feature. We can safely ignore it for this app.
        if (error.name !== 'NotAllowedError') {
          console.warn(`Could not play sound "${sound}":`, error.message);
        }
      });
    } else {
        console.warn(`Sound not loaded or does not exist: ${sound}`);
    }
  }, [audioFiles, isMuted]);

  const value = useMemo(() => ({ playSound }), [playSound]);

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};
