# WonderLearn Fast AI + Stable PDF Reader

This package fixes both:

- fast streaming AI responses
- React-PDF detached ArrayBuffer errors

## Preserve before replacing

Keep your existing:

- `server/.env`
- `server/public/books/`
- MongoDB data

## Replace

Replace your existing `client` and `server` folders with the folders in this package.

Then restore:

- your existing `server/.env`
- your existing `server/public/books/`

## Clean frontend install

```bash
cd client
rm -rf node_modules package-lock.json dist
npm install
npm run dev -- --force
```

The postinstall script automatically copies the exact matching PDF worker.

## Backend

```bash
cd server
npm install
npm run dev
```

Recommended server `.env`:

```env
OPENAI_TEXT_MODEL=gpt-5-nano
OPENAI_IMAGE_MODEL=gpt-image-1
```
