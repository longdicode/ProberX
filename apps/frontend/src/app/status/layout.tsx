import { Radio } from "lucide-react";
import Link from "next/link";

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2"><Radio className="w-5 h-5 text-primary" /><span className="font-semibold text-sm">ProberX Status</span></Link>
        <span className="text-xs text-muted-foreground">Powered by ProberX</span>
      </header>
      <main className="max-w-3xl mx-auto p-6">{children}</main>
    </div>
  );
}
