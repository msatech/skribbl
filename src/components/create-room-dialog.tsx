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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';

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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="roomName"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Room Name</FormLabel>
                  <div className="col-span-3 flex gap-2">
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <Button type="button" variant="outline" size="icon" onClick={handleSuggestRoomName} disabled={isSuggesting}>
                      <Sparkles className={`h-4 w-4 ${isSuggesting ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rounds"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Rounds</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="drawTime"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Draw Time (s)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="maxPlayers"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Max Players</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="wordLength"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Word Length</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" placeholder="0 for any" />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gameMode"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Game Mode</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </FormItem>
              )}
            />
          
            <FormField
              control={form.control}
              name="wordCount"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Word Count</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" disabled={form.watch('gameMode') !== 'combination'} />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hints"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Hints</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="col-span-3" />
                  </FormControl>
                  <FormMessage className="col-span-4 text-xs text-right" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPrivate"
              render={({ field }) => (
                <FormItem className="flex items-center justify-end space-x-2 pt-4">
                  <FormLabel>Private Room</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Game
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
