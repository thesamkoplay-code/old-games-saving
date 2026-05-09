# Old Games Saving

Lokální webová aplikace pro archiv starých her, save souborů, fotek, popisů a diskuze.

## Spuštění

1. Otevři tuto složku v terminálu.
2. Spusť:

```powershell
npm start
```

3. V prohlížeči otevři:

```text
http://localhost:2965
```

Administrátorský kód není uložený v klientském JavaScriptu. Prohlížeč ho přes F12 neuvidí; server porovnává pouze uložený PBKDF2 hash v `data/admin.json`.

## Data

- Položky a komentáře jsou v `data/store.json`.
- Nahrané fotky a soubory jsou ve složce `uploads`.
- Limit jednoho upload požadavku je nastavený na 512 MB.

Pro veřejný internet použij delší heslo než krátký číselný kód a spusť aplikaci za HTTPS/reverzní proxy.
