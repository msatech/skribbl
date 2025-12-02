'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type WordChoiceModalProps = {
  isOpen: boolean;
  words: string[];
  onSelectWord: (word: string) => void;
  time: number;
};

export default function WordChoiceModal({ isOpen, words, onSelectWord, time }: WordChoiceModalProps) {
  const [timeLeft, setTimeLeft] = useState(time);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(time);
      return;
    }

    if (timeLeft <= 0) {
      onSelectWord(words[Math.floor(Math.random() * words.length)]);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeLeft, onSelectWord, words, time]);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose a word to draw</DialogTitle>
          <DialogDescription>
            Pick a word. If you don't, one will be chosen for you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex justify-center gap-2 sm:gap-4">
            {words.map((word) => (
              <Button key={word} onClick={() => onSelectWord(word)} className="text-base sm:text-lg px-4 py-4 sm:px-6 sm:py-6 flex-1">
                {word}
              </Button>
            ))}
          </div>
          <div className="w-full mt-4">
            <Progress value={(timeLeft / time) * 100} className="h-2" />
            <p className="text-center text-sm mt-1">{timeLeft}s remaining</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
