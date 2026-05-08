# Soubory ke stazeni pro Vercel

Tahle verze je pro Vercel a uklada soubory do Vercel Blob, proto funguje i po redeployi.

## Nasazeni

1. Nahraj tuhle slozku do GitHubu a importuj ji ve Vercelu jako Next.js projekt.
2. Ve Vercelu otevri projekt, sekci Storage, vytvor Blob store a pripoj ho k projektu.
3. Vercel prida promennou `BLOB_READ_WRITE_TOKEN` automaticky.
4. Volitelne pridej Environment Variable `UPLOAD_PASSWORD`. Kdo zna heslo, muze nahravat. Stahovani zustane verejne.
5. Redeployni projekt.

## Lokalne

```bash
npm install
npm run dev
```

Pro lokalni test s Blob storem si stahni env promennou z Vercelu:

```bash
vercel env pull .env.local
```
