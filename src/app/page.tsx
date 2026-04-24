import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center">
      <h1 className="text-5xl font-extrabold text-foreground">
        Benvenuto in Il Mio Ricettario
      </h1>
      <p className="mt-4 text-xl text-muted-foreground">
        Il posto perfetto per conservare e organizzare tutte le tue ricette preferite.
      </p>
      <div className="mt-8 flex gap-4">
        <Button asChild size="lg">
          <Link href="/login">Accedi</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/register">Registrati</Link>
        </Button>
      </div>
    </div>
  );
}