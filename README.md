# old-games-saving

Jednoducha verze pro Vercel bez nahravani slozek na GitHub.

Nahraj do GitHubu jen tyhle soubory:

- `index.html`
- `style.css`
- `script.js`
- `api.js`
- `package.json`
- `vercel.json`
- `README.md`

Na Vercelu vytvor v projektu `Storage -> Blob`. Vercel prida `BLOB_READ_WRITE_TOKEN`.

Doporuceno: nastav v Environment Variables `UPLOAD_PASSWORD`. To je heslo pro nahravani. Pak se bez hesla neda nahravat, ale stahovani zustane verejne.

Kdyz `UPLOAD_PASSWORD` nenastavis, heslo neni zadne a pole na webu nech prazdne.

Antivir test pouziva VirusTotal. Pro zapnuti pridej do Environment Variables:

`VIRUSTOTAL_API_KEY`

Bez toho tlacitko Antivir napise, ze klic chybi.
