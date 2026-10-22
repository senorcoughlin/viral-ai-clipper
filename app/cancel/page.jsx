export default function Cancel() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Checkout canceled</h1>
        <p className="text-slate-400 mb-6">No charge was made.</p>
        <a href="/" className="px-4 py-2 bg-slate-800 rounded-lg">Return</a>
      </div>
    </div>
  );
}
