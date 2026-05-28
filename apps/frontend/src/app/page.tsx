import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, Eye, Bell, Timer, Globe, Shield, Zap, ArrowRight } from "lucide-react";

const features = [
  { icon: Eye, title: "Uptime Monitoring", desc: "HTTP, TCP, DNS, SSL, and Ping checks with configurable intervals and timeouts." },
  { icon: Bell, title: "Smart Alerts", desc: "Define threshold-based alert rules with multiple severity levels and notification channels." },
  { icon: Timer, title: "Cron Jobs", desc: "Schedule and execute commands across your server fleet with execution history." },
  { icon: Activity, title: "Real-time Metrics", desc: "CPU, memory, disk, and network metrics collected every 60 seconds via lightweight agents." },
  { icon: Globe, title: "Status Pages", desc: "Public status pages to communicate service health to your users." },
  { icon: Shield, title: "API Access", desc: "Full REST API and WebSocket support for programmatic access and real-time updates." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <Activity className="w-5 h-5 text-primary" />
            ProberX
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Sign In</Button></Link>
            <Link href="/register"><Button size="sm">Get Started</Button></Link>
          </nav>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-4 py-1.5 text-sm mb-8">
          <Zap className="w-4 h-4 text-primary" />
          Lightweight server monitoring platform
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance leading-tight">
          Monitor your servers,{" "}
          <span className="text-primary">effortlessly</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl text-balance">
          ProberX provides real-time metrics, uptime monitoring, smart alerts, and cron job management — all from a single dashboard.
        </p>
        <div className="mt-8 flex gap-3 flex-wrap justify-center">
          <Link href="/register"><Button size="lg" className="gap-2">Start Free <ArrowRight className="w-4 h-4" /></Button></Link>
          <Link href="/login"><Button variant="outline" size="lg">Sign In</Button></Link>
        </div>
      </section>

      <section className="px-6 py-20 border-t border-border/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Everything you need</h2>
            <p className="mt-3 text-muted-foreground">All the tools to keep your infrastructure healthy and your users informed.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border/50 bg-card p-6 hover:border-border transition-colors">
                <div className="rounded-lg bg-primary/10 w-10 h-10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 border-t border-border/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Ready to get started?</h2>
          <p className="mt-3 text-muted-foreground">Deploy the lightweight agent and start monitoring in minutes.</p>
          <div className="mt-6">
            <Link href="/register"><Button size="lg" className="gap-2">Create Free Account <ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/30 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} ProberX. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
