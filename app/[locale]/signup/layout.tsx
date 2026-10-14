export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div suppressHydrationWarning className="min-h-screen bg-slate-950">
      {children}
    </div>
  );
}
