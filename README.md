# Old Games Saving

Local web app for archiving old games, save files, screenshots, download instructions, and discussions.

## Run Locally

1. Open this folder in a terminal.
2. Run:

```powershell
npm start
```

3. Open:

```text
http://localhost:2965
```

The admin code is not stored in the browser JavaScript. The server checks a PBKDF2 hash from `data/admin.json`.
Admin login uses a signed token/cookie so it can work on hosting where requests do not always hit the same Node instance.

For public hosting, set the `SESSION_SECRET` environment variable to a long random string.

## Vercel

The project includes `api/[...path].js` and `vercel.json` so Vercel can serve `/api/items`, `/api/login`, and `/api/me`.

Vercel does not provide persistent normal file storage. Use the URL fields in the admin panel:

- `Or cover image URL`
- `Or gallery image URLs`
- `Or download links`

Download links can use either format:

```text
https://example.com/file.zip
File name | https://example.com/file.zip
```

## Data

- Items and comments are stored in `data/store.json` locally.
- Uploaded local files are stored in `uploads` locally.
- On Vercel, use external links for real downloads.
