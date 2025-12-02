
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Sparkles, Users, Plus, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { getSuggestedNickname } from '@/lib/actions';
import useLocalStorage from '@/hooks/use-local-storage';
import CreateRoomDialog from './create-room-dialog';
import { useSocket } from '@/contexts/socket-context';
import type { PublicRoom } from '@/types';

const FormSchema = z.object({
  nickname: z.string().min(2, {
    message: 'Nickname must be at least 2 characters.',
  }).max(20, {
    message: 'Nickname must not be longer than 20 characters.',
  }),
});

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [nickname, setNickname] = useLocalStorage('nickname', '');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { socket, isConnected } = useSocket();
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { nickname: '' },
  });

  useEffect(() => {
    if (nickname && isClient) {
      form.setValue('nickname', nickname);
    }
  }, [nickname, form, isClient]);
  
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    socket.emit('getPublicRooms', (rooms: PublicRoom[]) => {
      setPublicRooms(rooms);
    });

    const roomListUpdate = (rooms: PublicRoom[]) => setPublicRooms(rooms);
    socket.on('publicRoomsUpdate', roomListUpdate);

    return () => {
      socket.off('publicRoomsUpdate', roomListUpdate);
    }

  }, [socket, isConnected]);

  const handleSuggestNickname = async () => {
    setIsSuggesting(true);
    try {
      const suggestion = await getSuggestedNickname();
      if (suggestion) {
        form.setValue('nickname', suggestion);
        setNickname(suggestion);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not suggest a nickname.',
      });
    } finally {
      setIsSuggesting(false);
    }
  };
  
  const onSubmit = (data: z.infer<typeof FormSchema>) => {
    setNickname(data.nickname);
    setIsDialogOpen(true);
  }
  
  const handleJoinRoom = (roomId: string) => {
    const currentNickname = form.getValues('nickname');
    if (!currentNickname || currentNickname.length < 2) {
        toast({
            variant: "destructive",
            title: "Nickname required",
            description: "Please enter a valid nickname before joining a room.",
        });
        form.setFocus('nickname');
        return;
    }
    setNickname(currentNickname);
    router.push(`/room/${roomId}`);
  }
  
  const handleJoinPublic = () => {
    if (publicRooms.length > 0) {
      handleJoinRoom(publicRooms[0].id);
    } else {
      toast({
        title: "No Public Rooms",
        description: "No public rooms available. Why not create one?",
      });
    }
  };

  if (!isClient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-headline text-center text-primary">DrawTogether</CardTitle>
          <CardDescription className="text-center">Your canvas for fun is just a click away!</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nickname</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input placeholder="Enter your nickname" {...field} />
                      </FormControl>
                      <Button type="button" variant="outline" size="icon" onClick={handleSuggestNickname} disabled={isSuggesting}>
                        {isSuggesting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Create Private Room
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
            <div className="w-full text-center text-sm text-muted-foreground">or join a public game</div>
             <Button className="w-full" onClick={handleJoinPublic} disabled={publicRooms.length === 0}>
                <Users className="mr-2 h-4 w-4" /> Join Public Game
              </Button>
            {publicRooms.length > 0 && (
                <div className="w-full space-y-2 pt-4">
                    <h3 className="font-semibold text-center">Active Rooms</h3>
                    {publicRooms.map(room => (
                        <div key={room.id} className="flex items-center justify-between p-2 rounded-md border">
                            <div>
                                <p className="font-medium">{room.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    <Users className="inline h-3 w-3 mr-1" /> {room.playerCount}/{room.maxPlayers}
                                </p>
                            </div>
                            <Button size="sm" onClick={() => handleJoinRoom(room.id)}>
                                <LogIn className="mr-2 h-4 w-4"/> Join
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </CardFooter>
      </Card>
      <CreateRoomDialog 
        isOpen={isDialogOpen} 
        setIsOpen={setIsDialogOpen} 
        nickname={form.watch('nickname')}
      />
    </div>
  );
}

    