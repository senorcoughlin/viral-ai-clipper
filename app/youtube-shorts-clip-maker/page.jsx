import GuidePage, { guideMetadata } from '../../components/GuidePage';

const path = '/youtube-shorts-clip-maker';
export const metadata = guideMetadata({ path, title: "YouTube Shorts Clip Maker: Long Videos to Shorts with AI", description: "Turn long YouTube videos into vertical Shorts with captions and a viral score. Paste a link, pick a length, and download 9:16 clips ready to upload." });

const sections = [
 [
  "Why clip your own long videos into Shorts",
  [
   "Shorts reach people who would never click a 20-minute video. A good Short works like a trailer: someone sees a sharp 30-second moment, checks your channel and finds the full video. Clipping your back catalog is one of the cheapest ways to get new viewers, because the content is already made.",
   "The hard part is time. Scrubbing through an hour of footage to find three good moments, reframing them and captioning them can take longer than recording. That is the part the AI does for you."
  ]
 ],
 [
  "Step by step",
  [
   [
    "Copy the link to your YouTube video. Regular videos, Shorts and live replays all work.",
    "Paste it on the Viral AI Clipper home page and choose 9:16.",
    "Pick a length. Under 60 seconds is the safe zone for Shorts; 30 to 45 seconds suits most talking videos.",
    "Choose how many clips you want, from 1 to 8, and a caption pack such as Bold or Podcast.",
    "Generate, then review the clips in order of viral score. Fix any caption words, re-render if needed and download.",
    "Upload to YouTube Shorts yourself, or connect your channel and send clips to YouTube as private videos so you can review them in YouTube Studio before publishing."
   ]
  ]
 ],
 [
  "What makes a Short perform",
  [
   "The score is based on things that tend to matter on short-form feeds. We do not promise views, and nobody honestly can, but these are worth checking before you post:",
   [
    "A hook in the first 2 seconds. A clip that starts mid-sentence or with filler loses people immediately.",
    "One idea per clip. A Short that tries to cover three points usually lands none of them.",
    "Readable captions. Most people watch with sound off at first, so captions carry the clip.",
    "A clean ending. Clips that stop on a punchline or a payoff get rewatched; clips that trail off do not.",
    "A title and on-screen hook that make the topic obvious. You can add hook text pinned to the top of the frame."
   ]
  ]
 ],
 [
  "Reframing to vertical",
  [
   "Most long videos are 16:9. Viral AI Clipper crops to 720x1280 and biases the crop toward the upper center of the frame, where faces usually are, and can detect faces to center the speaker. For gameplay, the Gameplay pack punches in so the action fills the screen. If your video has a facecam, you can also overlay a separate facecam or reaction video in the corner."
  ]
 ],
 [
  "Free vs Pro",
  [
   "You can make Shorts free with 3 generations a day; free clips carry a small, faint watermark. Pro ($19.99/month) removes the watermark, raises the daily limit and adds batch processing for up to 10 links at once, which helps when you are clipping a whole back catalog."
  ]
 ]
];
const faqs = [
 [
  "How long should a YouTube Short be?",
  "Shorts can be up to 60 seconds for this workflow. For most talking content, 30 to 45 seconds is a good starting point."
 ],
 [
  "Can it post to YouTube for me?",
  "You can connect your YouTube channel and upload clips as private videos, then publish them from YouTube Studio when you are ready."
 ],
 [
  "Does it add captions automatically?",
  "Yes. Captions are timed to the spoken words and you can edit the words and re-render a clip."
 ],
 [
  "Can I use other people’s videos?",
  "Only if you have permission or your use is allowed by the rights holder. Many creators run official clipping programs; see our Clipping programs page."
 ]
];

export default function Page() {
  return <GuidePage path={path} h1={"Turn long YouTube videos into Shorts"} intro={"If you already have long videos on YouTube, you already have Shorts. Viral AI Clipper finds the strongest moments in a video, crops them to 9:16, adds word-timed captions and scores each one, so you can feed your Shorts shelf without editing every clip by hand."} sections={sections} faqs={faqs} />;
}
