export default function Cancel() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots [background-size:28px_28px] opacity-60" />
      <div className="card relative flex w-full max-w-md flex-col items-center gap-4 p-10">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Checkout canceled</h1>
        <p className="text-soft">No charge was made. Your free clips are still waiting.</p>
        <a href="/" className="btn-ghost h-12 w-full no-underline">Back to the app</a>
      </div>
    </div>
  );
}
