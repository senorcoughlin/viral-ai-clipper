import GuidePage, { guideMetadata } from '../../components/GuidePage';

const path = '/how-to-clip-twitch-streams';
export const metadata = guideMetadata({ path, title: "How to Clip Twitch Streams into Shorts and TikToks", description: "A practical guide to turning Twitch streams and VODs into vertical clips for TikTok, Shorts and Reels, including facecam layouts, gameplay zoom and captions." });

const sections = [
 [
  "Step 1: Get the footage",
  [
   "You have a few options, depending on whose stream it is and how you save broadcasts:",
   [
    "Turn on “Store past broadcasts” in your Twitch creator settings so your streams are saved as VODs.",
    "Download your own VOD from the Twitch Video Producer page, or export it to YouTube. Twitch has a built-in YouTube export for past broadcasts and highlights.",
    "If you also stream to YouTube or upload the VOD there, you can paste that YouTube link straight into the clipper.",
    "For the most reliable results, trim the VOD to the section you care about and upload the MP4 directly."
   ],
   "Only clip other streamers’ content if they allow it. Many streamers run clipping programs and want clips; others do not. Check before you post."
  ]
 ],
 [
  "Step 2: Find the moments",
  [
   "On stream, the best moments are usually reactions, chat interactions, big plays and stories. Two shortcuts help:",
   [
    "Look at the Twitch clips viewers made during the stream. Those timestamps are a strong signal.",
    "Note timestamps while streaming, or ask a mod to drop them in chat."
   ],
   "If you do not have timestamps, Viral AI Clipper reads the transcript and picks moments where something is said that works on its own. Keep in mind it works from speech, so a silent clutch play with no commentary is harder for it to spot than a loud reaction."
  ]
 ],
 [
  "Step 3: Make the clips",
  [
   [
    "Paste the YouTube link or upload the MP4.",
    "Choose 9:16 and the Gameplay zoom pack. It punches in so the action fills the vertical frame and uses bright captions.",
    "Pick 30 to 45 seconds. Stream moments often need a few seconds of setup before the payoff.",
    "Ask for 3 to 8 clips depending on how long the section is.",
    "If you want your facecam in a corner, upload your facecam recording as a separate overlay video when you re-render a clip."
   ]
  ]
 ],
 [
  "Step 4: Polish and post",
  [
   [
    "Check the viral score and the reasons under it, and post the strongest clips first.",
    "Fix any gamer slang, names or usernames the transcript got wrong, then re-render.",
    "Add a short hook at the top, such as what is about to happen.",
    "Post to TikTok, Shorts and Reels, and put your Twitch handle in the caption so people can find the live stream."
   ]
  ]
 ],
 [
  "How often to post",
  [
   "Consistency beats volume spikes. One to three clips a day from your latest streams is a pace most streamers can keep up with. The free plan covers 3 generations a day; Pro ($19.99/month) removes the watermark and lets you batch up to 10 links at once."
  ]
 ]
];
const faqs = [
 [
  "Can I paste a Twitch link directly?",
  "YouTube links are the supported and most reliable path. For Twitch footage, export the VOD to YouTube or download it and upload the MP4."
 ],
 [
  "Can I keep my facecam in the clip?",
  "Yes. You can add a separate facecam or reaction video as an overlay in the corner when you re-render a clip."
 ],
 [
  "Is it OK to clip other streamers?",
  "Only with permission or under an official clipping program. Our Clipping programs page lists ways creators share their content."
 ],
 [
  "What clip length works best for streams?",
  "30 to 45 seconds is a good default; it leaves room for setup and payoff."
 ]
];

export default function Page() {
  return <GuidePage path={path} h1={"How to clip Twitch streams into Shorts and TikToks"} intro={"Streams are long, and the best moments are buried in hours of footage. This guide covers how to get your stream footage out of Twitch, how to find the moments worth clipping, and how to turn them into vertical clips with Viral AI Clipper."} sections={sections} faqs={faqs} />;
}
