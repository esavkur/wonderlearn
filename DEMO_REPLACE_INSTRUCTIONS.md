# WonderLearn — Today's Demo Upgrade

Adds:

- detailed streaming Roman-script Hinglish explanation
- separate AI diagram button
- Read Aloud with Play, Pause/Resume, Stop and speed controls
- Copy explanation
- stable Blob PDF reader retained

Preserve before replacement:

- `server/.env`
- `server/public/books/`

Recommended:

```env
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_IMAGE_MODEL=gpt-image-1
```

Restart:

```bash
cd client
rm -rf node_modules/.vite dist
npm install
npm run dev -- --force
```

```bash
cd server
npm install
npm run dev
```

Read Aloud uses Chrome's built-in Speech Synthesis API and prefers `hi-IN` or
`en-IN` installed voices. No extra API key is needed.
