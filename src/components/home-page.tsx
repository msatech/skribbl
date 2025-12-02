
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
import { useGame } from '@/contexts/game-context';

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
  const [storedNickname, setStoredNickname] = useLocalStorage('nickname', '');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { setNickname, addPlayer, setHost } = useGame();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { nickname: '' },
  });

  useEffect(() => {
    if (storedNickname && isClient) {
      form.setValue('nickname', storedNickname);
    }
  }, [storedNickname, form, isClient]);

  const handleSuggestNickname = async () => {
    setIsSuggesting(true);
    try {
      const suggestion = await getSuggestedNickname();
      if (suggestion) {
        form.setValue('nickname', suggestion);
        setStoredNickname(suggestion);
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
    setStoredNickname(data.nickname);
    setNickname(data.nickname); 
    addPlayer(data.nickname); 
    setHost();
    setIsDialogOpen(true);
  }
  
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
                <Plus className="mr-2 h-4 w-4" /> Create Game Room
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <CreateRoomDialog 
        isOpen={isDialogOpen} 
        setIsOpen={setIsDialogOpen} 
        nickname={form.watch('nickname')}
      />
    </div>
  );
}
