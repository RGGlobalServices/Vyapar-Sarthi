export default function Signup() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="text-center max-w-xl">
        <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Create Your Account</h1>
        <p className="text-slate-300 text-lg mb-8">Join 2,000+ shop owners. Start your free trial today.</p>
        <a href="/register" className="inline-block px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-lg hover:opacity-90 transition shadow-lg shadow-indigo-500/25">
          Get Started Free
        </a>
        <p className="text-slate-500 mt-4">No credit card required • Free forever plan</p>
      </div>
    </div>
  );
}
