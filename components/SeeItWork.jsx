'use client'
import { useEffect, useRef, useState } from 'react'

const EXAMPLES = [
  {
    src: '/examples/first-video.mp4',
    poster: '/examples/first-video.jpg',
    title: 'The Video That Started YouTube',
    source: '19s YouTube video → 15s vertical Short',
    score: 85,
    reasons: [
      ['Hook', 'Instantly sparks curiosity about internet history'],
      ['Pacing', 'Short, deadpan delivery keeps attention locked'],
      ['Emotion', 'Nostalgic humor that gets people commenting'],
    ],
  },
]

function LazyVideo({ src, poster, label }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); el.play?.().catch(() => {}) } else if (on) el.pause?.()
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [on])
  return (
    <video
      ref={ref}
      src={on ? src : undefined}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay={on}
      preload="none"
      aria-label={label}
      className="block aspect-[9/16] w-full rounded-card bg-black object-cover"
    />
  )
}

export default function SeeItWork() {
  return (
    <section id="see-it-work" className="flex flex-col gap-8 pb-24">
      <div className="flex max-w-[640px] flex-col gap-3">
        <span className="eyebrow">See it work</span>
        <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">A real clip, straight out of the app.</h2>
        <p className="text-base leading-relaxed text-soft">One pasted link. The AI picked the moment, cropped it to 9:16, timed the captions to each spoken word and scored it. No editing.</p>
      </div>
      {EXAMPLES.map(ex => (
        <div key={ex.src} className="grid min-w-0 grid-cols-1 items-center gap-8 md:grid-cols-[280px_1fr]">
          <div className="mx-auto w-full max-w-[260px] md:max-w-[280px]">
            <LazyVideo src={ex.src} poster={ex.poster} label={`Example clip: ${ex.title}`} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-line2 px-3 py-1 font-mono text-sm text-white">Viral score {ex.score}</span>
              <span className="text-sm text-soft">{ex.source}</span>
            </div>
            <h3 className="font-display text-2xl font-extrabold text-white">{ex.title}</h3>
            <ul className="flex flex-col gap-2">
              {ex.reasons.map(([k, v]) => (
                <li key={k} className="text-sm leading-relaxed text-soft"><span className="font-semibold text-white">{k}:</span> {v}</li>
              ))}
            </ul>
            <a href="#top" className="w-fit text-sm font-semibold text-white underline underline-offset-4">Try it with your own link →</a>
          </div>
        </div>
      ))}
    </section>
  )
}
