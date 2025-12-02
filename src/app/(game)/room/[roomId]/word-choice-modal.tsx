'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type WordChoiceModalProps = {
  isOpen: boolean;
  words: string[];
  onSelectWord: (word: string) => void;
};

export default function WordChoiceModal({ isOpen, words, onSelectWord }: WordChoiceModalProps) {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose a word to draw</DialogTitle>
          <DialogDescription>
            You have 15 seconds to pick a word.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-4 py-4">
          {words.map((word) => (
            <Button key={word} onClick={() => onSelectWord(word)} className="text-lg px-6 py-6">
              {word}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
