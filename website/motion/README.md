# Mira Motion Compositions

Requirements: Node 22+ and FFmpeg.

Preview:

```powershell
npx hyperframes preview
```

Render one composition:

```powershell
npx hyperframes render . --composition compositions/hero-aurora.html --output ..\public\motion\hero-aurora.mp4 --fps 30 --crf 34
ffmpeg -y -i ..\public\motion\hero-aurora.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -an ..\public\motion\hero-aurora.webm
ffmpeg -y -i ..\public\motion\hero-aurora.mp4 -frames:v 1 -q:v 4 ..\public\motion\hero-aurora.jpg
```

Repeat with:

- `referral-flywheel.html` -> `referral-flywheel`
- `miracare-pulse.html` -> `miracare-pulse`
- `mirabeauty-scan.html` -> `mirabeauty-scan`

Budgets:

- `hero-aurora.mp4` <= 2.5MB
- `referral-flywheel.mp4` <= 1.8MB
- `miracare-pulse.mp4` <= 1.5MB
- `mirabeauty-scan.mp4` <= 1.5MB

Verify the loop seam by eye after every render.

## `ai-chat-story` (section #ai-chat, 1920x1080, 16s)

A narrated phone cinematic for the AI Chat section that tells 01 recommend ->
02 close in chat -> 03 control your catalog, then ties the catalog edit back to
the chat. It contains readable Thai text, so it self-hosts the fonts from
`motion/fonts/` (copied from `public/fonts/`) via `@font-face`. The timeline ends
faded-out to match its empty first frame, so the embedded `<video loop>` seam is clean.

```powershell
npx hyperframes render . -c compositions/ai-chat-story.html -o ..\public\motion\ai-chat-story.mp4 --fps 30 --crf 30
ffmpeg -y -i ..\public\motion\ai-chat-story.mp4 -c:v libvpx-vp9 -crf 34 -b:v 0 -an ..\public\motion\ai-chat-story.webm
# poster is taken mid-story (recommendation beat), not the empty first frame:
ffmpeg -y -ss 3.9 -i ..\public\motion\ai-chat-story.mp4 -frames:v 1 -q:v 4 ..\public\motion\ai-chat-story.jpg
```

Quick visual check of a draft before the final encode: `npx hyperframes render . -c compositions/ai-chat-story.html -o draft.mp4 --quality draft` then sample frames with ffmpeg. Rendered size: mp4 ~0.53MB / webm ~0.65MB.
