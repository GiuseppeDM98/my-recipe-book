export function Footer({ className }: { className?: string }) {
  return (
    <footer className={`p-4 text-center text-sm text-muted-foreground border-t${className ? ` ${className}` : ''}`}>
      <p>&copy; {new Date().getFullYear()} Il Mio Ricettario. Tutti i diritti riservati.</p>
    </footer>
  );
}