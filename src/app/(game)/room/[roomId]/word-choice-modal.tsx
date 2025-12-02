
'use client';
import { useEffect, useState, useRef } from 'react';
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chosenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      chosenRef.current = false;
      setTimeLeft(time);
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);

    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOpen, time]);

  useEffect(() => {
    if (timeLeft <= 0 && isOpen && !chosenRef.current) {
      if (words.length > 0) {
        handleSelect(words[Math.floor(Math.random() * words.length)]);
      }
    }
  }, [timeLeft, isOpen, words]);


  const handleSelect = (word: string) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    onSelectWord(word);
    if (timerRef.current) clearInterval(timerRef.current);
  }

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
              <Button key={word} onClick={() => handleSelect(word)} className="text-base sm:text-lg px-4 py-4 sm:px-6 sm:py-6 flex-1">
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

    
