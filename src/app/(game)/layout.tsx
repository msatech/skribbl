export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full bg-background">
      {children}
    </main>
  );
}
