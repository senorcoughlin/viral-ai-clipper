export default function SimpleHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
        <a href="/" className="flex items-center gap-2.5 text-fg no-underline">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime font-extrabold text-ink">V</span>
          <span className="hidden font-display text-lg sm:inline font-extrabold tracking-tight">Viral AI Clipper</span>
        </a>
        <nav className="flex min-w-0 gap-3 text-[13px] sm:gap-5 sm:text-sm font-medium text-soft">
          <a href="/monetize" className="hover:text-fg">Monetize</a>
          <a href="/permissions" className="hover:text-fg">Permissions</a>
          <a href="/programs" className="hover:text-fg">Programs</a>
        </nav>
      </div>
    </header>
  );
}
