'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getSuggestedRoomName } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/socket-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FormControl } from './ui/form';

const RoomSettingsSchema = z.object({
  roomName: z.string().min(3, 'Too short').max(30, 'Too long'),
  isPrivate: z.boolean(),
  rounds: z.coerce.number().min(1).max(10),
  drawTime: z.coerce.number().min(30).max(120),
  maxPlayers: z.coerce.number().min(2).max(12),
  wordCount: z.coerce.number().min(1).max(5),
  wordLength: z.coerce.number().min(0).max(10),
  gameMode: z.enum(['normal', 'combination']),
  hints: z.coerce.number().min(0).max(5),
});

type CreateRoomDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  nickname: string;
};

export default function CreateRoomDialog({ isOpen, setIsOpen, nickname }: CreateRoomDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { socket, isConnected } = useSocket();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<z.infer<typeof RoomSettingsSchema>>({
    resolver: zodResolver(RoomSettingsSchema),
    defaultValues: {
      roomName: `${nickname}'s Room`,
      isPrivate: false,
      rounds: 3,
      drawTime: 80,
      maxPlayers: 8,
      wordCount: 1,
      wordLength: 0,
      gameMode: 'normal',
      hints: 2,
    },
  });

  const handleSuggestRoomName = async () => {
    setIsSuggesting(true);
    try {
      const suggestion = await getSuggestedRoomName();
      if (suggestion) {
        form.setValue('roomName', suggestion);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not suggest a room name.',
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  const onSubmit = (values: z.infer<typeof RoomSettingsSchema>) => {
    if (!isConnected || !socket) {
      toast({ variant: 'destructive', title: 'Not connected to server.' });
      return;
    }
    
    setIsCreating(true);
    const player = { nickname };
    const { roomName, isPrivate, ...settings } = values;

    socket.emit('createRoom', { roomName, isPrivate, settings, player }, (response: { status: string; roomId?: string; message?: string }) => {
      setIsCreating(false);
      if (response.status === 'ok' && response.roomId) {
        router.push(`/room/${response.roomId}`);
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to create room',
          description: response.message || 'An unknown error occurred.',
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a New Room</DialogTitle>
          <DialogDescription>
            Customize your game settings and invite your friends.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="roomName" className="text-right">Room Name</Label>
            <div className="col-span-3 flex gap-2">
              <Input id="roomName" {...form.register('roomName')} className="w-full" />
              <Button type="button" variant="outline" size="icon" onClick={handleSuggestRoomName} disabled={isSuggesting}>
                <Sparkles className={`h-4 w-4 ${isSuggesting ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {form.formState.errors.roomName && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.roomName.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rounds" className="text-right">Rounds</Label>
            <Input id="rounds" type="number" {...form.register('rounds')} className="col-span-3" />
             {form.formState.errors.rounds && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.rounds.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="drawTime" className="text-right">Draw Time (s)</Label>
            <Input id="drawTime" type="number" {...form.register('drawTime')} className="col-span-3" />
            {form.formState.errors.drawTime && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.drawTime.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="maxPlayers" className="text-right">Max Players</Label>
            <Input id="maxPlayers" type="number" {...form.register('maxPlayers')} className="col-span-3" />
            {form.formState.errors.maxPlayers && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.maxPlayers.message}</p>}
          </div>

           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="wordLength" className="text-right">Word Length</Label>
            <Input id="wordLength" type="number" {...form.register('wordLength')} className="col-span-3" placeholder="0 for any"/>
            {form.formState.errors.wordLength && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.wordLength.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Game Mode</Label>
            <Select onValueChange={(value) => form.setValue('gameMode', value as 'normal' | 'combination')} defaultValue={form.getValues('gameMode')}>
                <FormControl>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select game mode" />
                    </SelectTrigger>
                </FormControl>
                <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="combination">Combination</SelectItem>
                </SelectContent>
            </Select>
          </div>
          
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="wordCount" className="text-right">Word Count</Label>
            <Input id="wordCount" type="number" {...form.register('wordCount')} className="col-span-3" disabled={form.watch('gameMode') !== 'combination'}/>
            {form.formState.errors.wordCount && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.wordCount.message}</p>}
          </div>

           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="hints" className="text-right">Hints</Label>
            <Input id="hints" type="number" {...form.register('hints')} className="col-span-3" />
            {form.formState.errors.hints && <p className="col-span-4 text-xs text-destructive text-right">{form.formState.errors.hints.message}</p>}
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4">
            <Label htmlFor="isPrivate">Private Room</Label>
            <Switch id="isPrivate" {...form.register('isPrivate')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Game
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
