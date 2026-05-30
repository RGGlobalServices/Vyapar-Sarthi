export default function HelpCenter() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Help Center</h1>
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-2">How do I create a bill?</h3>
          <p className="text-slate-300">Go to Billing section, add customer details, select products, and generate the bill. You can print or share it via WhatsApp.</p>
        </div>
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-2">How do I track inventory?</h3>
          <p className="text-slate-300">Add products in the Inventory section. Stock levels update automatically when bills are created.</p>
        </div>
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-2">Can I use it on mobile?</h3>
          <p className="text-slate-300">Yes! Vyapar Sarthi works on any device with a web browser. No app installation required.</p>
        </div>
        <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-2">How do I reset my password?</h3>
          <p className="text-slate-300">Click on "Forgot Password" on the login page and follow the instructions sent to your email.</p>
        </div>
      </div>
    </div>
  );
}
