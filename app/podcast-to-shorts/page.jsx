import GuidePage, { guideMetadata } from '../../components/GuidePage';

const path = '/podcast-to-shorts';
export const metadata = guideMetadata({ path, title: "Podcast to Shorts: Turn Episodes into Viral Clips with AI", description: "Turn a podcast episode into short vertical clips with word-timed captions. Find the best moments automatically and post them to Shorts, TikTok and Reels." });

const sections = [
 [
  "Why podcasts clip so well",
  [
   "Podcasts are almost all talking, which means the transcript holds nearly everything that matters. That makes them ideal for AI clipping: the model can read the whole conversation, find where an idea starts and where it lands, and cut on those points instead of at random timestamps.",
   "Short clips are also how most podcasts grow now. People rarely discover a show by searching for it; they find a 40-second clip in their feed and go looking for the full episode."
  ]
 ],
 [
  "How to do it",
  [
   [
    "Upload the episode video to YouTube (unlisted is fine) and paste the link, or upload the MP4 directly.",
    "Choose 9:16 and the Podcast caption pack, which uses clean white captions that suit conversation.",
    "Pick 30 to 60 seconds per clip. Podcast moments often need a little more setup than other content.",
    "Ask for 5 to 8 clips from a full episode.",
    "Review the clips by score, fix any names or terms the transcript got wrong, and download."
   ]
  ]
 ],
 [
  "Picking the right moments",
  [
   "When you review the clips, the ones that tend to work share a few traits:",
   [
    "They make sense without the rest of the episode. If a viewer needs context from 10 minutes earlier, the clip will not land.",
    "They open on a claim, question or surprise rather than “so, yeah, anyway”.",
    "They have one speaker making one point, or a quick back-and-forth with a clear payoff.",
    "They end on a line that sticks, not in the middle of a thought."
   ],
   "The viral score reflects these things, and the reasons under each score tell you why a clip scored the way it did. Treat it as a second opinion, not a guarantee."
  ]
 ],
 [
  "Framing two or more speakers",
  [
   "Vertical crops of wide podcast shots are tricky because two people sit side by side. The clipper biases the crop toward faces and can center on the person speaking in many setups, but for multi-camera podcasts the best results come from uploading the camera angle that shows the speaker, or a video already edited to the active speaker."
  ]
 ],
 [
  "Captions and branding",
  [
   "Captions are timed to each spoken word and appear in short chunks so they are easy to read on a phone. You can save a brand kit with your caption color, size and position so every clip from your show looks the same, and add hook text at the top of the frame, such as the episode topic or guest name."
  ]
 ],
 [
  "Cost",
  [
   "You can clip a podcast on the free plan with 3 generations a day; free clips have a small watermark. Pro is $19.99 a month with no watermark, every style and batch processing for multiple episodes. There is no per-minute charge, so a two-hour episode costs the same single generation as a ten-minute one."
  ]
 ]
];
const faqs = [
 [
  "Can I clip an audio-only podcast?",
  "The clipper works on video. For audio-only shows, export the episode as a simple video (for example with a static cover image) and upload that."
 ],
 [
  "How long can the episode be?",
  "Long episodes work. Very long sources take longer to process, and YouTube links are usually the fastest path."
 ],
 [
  "Can I fix wrong words in the captions?",
  "Yes. Edit the caption words in the clip editor and re-render the clip."
 ],
 [
  "Is there a watermark?",
  "Free clips carry a small, faint viralaiclipper.com mark in the corner. Pro and credit-paid clips do not."
 ]
];

export default function Page() {
  return <GuidePage path={path} h1={"Turn podcast episodes into Shorts, TikToks and Reels"} intro={"A one-hour podcast usually has five or six moments that would work on their own: a strong opinion, a funny exchange, a story with a payoff. Viral AI Clipper finds those moments in the transcript, cuts them to vertical, adds clean captions and scores them so you can post the best ones first."} sections={sections} faqs={faqs} />;
}
