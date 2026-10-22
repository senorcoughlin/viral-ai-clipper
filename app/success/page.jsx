export default function Success() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-6">
      <div>
        <h1 className="text-3xl font-bold text-emerald-400 mb-2">You're Pro!</h1>
        <p className="text-slate-400 mb-6">Unlimited generations unlocked. Redirecting...</p>
        <a href="/" className="px-4 py-2 bg-indigo-600 rounded-lg">Back to app</a>
      </div>
    </div>
  );
}
