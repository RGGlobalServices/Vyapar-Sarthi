export default function Success() {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || '';
  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Registration Successful!</h1>
        <p className="text-slate-300 mb-8">Welcome to Vyapar Sarthi. You can now log in and start managing your shop.</p>
        <a href={`${frontendUrl}/en/login`} className="inline-block px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition">Go to Login</a>
      </div>
    </div>
  );
}
