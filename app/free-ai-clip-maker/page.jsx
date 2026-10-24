import GuidePage, { guideMetadata } from '../../components/GuidePage';

const path = '/free-ai-clip-maker';
export const metadata = guideMetadata({ path, title: "Free AI Clip Maker: Turn Long Videos into Short Clips", description: "Make short vertical clips from long videos for free. Paste a YouTube link or upload an MP4 and get captioned, scored clips for Shorts, TikTok and Reels." });

const sections = [
 [
  "What you get on the free plan",
  [
   "The free plan is meant for actually using the tool, not just a demo. Each day you can run 3 generations, and each generation can return up to 8 clips from one video.",
   [
    "Paste a YouTube link (including Shorts and live replays) or upload your own MP4.",
    "Pick a format: 9:16 for Shorts, TikTok and Reels, 16:9 for landscape, or 1:1 for feeds.",
    "Pick a clip length of 15, 30, 45 or 60 seconds and how many clips you want, from 1 to 8.",
    "Captions are timed to the spoken words and pop on in 2 to 3 word chunks.",
    "Every clip gets a viral score with reasons, so you know which ones to post first."
   ],
   "Free clips carry a small, faint viralaiclipper.com mark in the top-left corner. Pro clips and clips made with credits have no watermark."
  ]
 ],
 [
  "How it works",
  [
   "You paste a link or upload a file. The AI gets the transcript, either from YouTube captions or by transcribing the audio, and looks for moments that open with a hook, keep moving and end cleanly. It then cuts each moment, reframes it to vertical with a crop biased toward where speakers usually sit, and burns in captions.",
   "Scoring is the part we care most about. Plenty of clippers give every clip a 90+. We try to score honestly, so a weak clip gets a weak score and you can skip it instead of posting it and wondering why it flopped."
  ]
 ],
 [
  "Tips for better free clips",
  [
   [
    "Use videos with clear speech. Talking-head videos, interviews and podcasts clip best because the transcript carries the story.",
    "Start with 30-second clips. They are long enough for a full thought and short enough to hold attention.",
    "Ask for 3 to 5 clips rather than 8 when the video is short. Fewer, stronger moments beat many weak ones.",
    "Edit the caption words before posting if a name or term was transcribed wrong. You can re-render a clip with fixed words.",
    "Post the highest-scoring clip first, then test the others over the next few days."
   ]
  ]
 ],
 [
  "When to upgrade",
  [
   "If you post every day or run a clipping channel, 3 generations a day goes quickly. Pro is $19.99 a month or $199.99 a year and raises the daily limit, removes the watermark, unlocks every style and lets you batch up to 10 links. If you only clip now and then, credit packs start at $9 for 10 extra generations.",
   "There is no per-minute billing. A generation is one video in and a set of clips out, whether the source is 10 minutes or 2 hours."
  ]
 ]
];
const faqs = [
 [
  "Is Viral AI Clipper really free?",
  "Yes. The free plan gives you 3 generations a day with no card required. Free clips have a small watermark; Pro and credit-paid clips do not."
 ],
 [
  "How many clips do I get from one video?",
  "You choose between 1 and 8 clips per generation."
 ],
 [
  "What video sources work?",
  "YouTube links work best. You can also upload an MP4 file directly, which is the most reliable option for other platforms."
 ],
 [
  "Do I need to install anything?",
  "No. It runs in the browser on desktop and mobile, and you can add it to your home screen as an app."
 ]
];

export default function Page() {
  return <GuidePage path={path} h1={"Free AI clip maker for Shorts, TikTok and Reels"} intro={"Viral AI Clipper turns one long video into up to 8 short clips. It reads the transcript, picks moments with a strong hook, cuts them to the length you choose, burns in word-by-word captions and gives each clip an honest viral score. The free plan gives you 3 generations a day with no credit card."} sections={sections} faqs={faqs} />;
}
