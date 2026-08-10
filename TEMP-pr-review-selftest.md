# TEMP: Selbsttest für 80_CONTINUE_PR_REVIEW

Diese Datei ist ein Wegwerf-Artefakt. Sie prüft den Jenkins-Job
`80_CONTINUE_PR_REVIEW` end-to-end und wird anschließend wieder entfernt.

Getestet werden:

1. Umwandlung eines Draft-PR in einen normalen PR nach Ablauf der Wartezeit
2. Automatisches Review durch `agy` mit dem Modell `gemini-3.6-flash-high`
3. Quittierung: Approve, Kommentar und Label `auto-approved`

## Zeichen, die das Shell-Quoting im Runner belasten

Der Diff dieser Datei enthält bewusst Zeichen, an denen eine unsauber
gequotete Übergabe an die CLI zerbrechen würde:

```bash
wert="doppelt gequotet"
befehl=`echo backtick`
variable=$HOME und ${PATH}
pfad='C:\temp\backslash'
sonder=$(date +%s) && echo "ok" || echo 'fehlgeschlagen'
```

Eine Zeile mit einem Tabulator und einer Pipe:	Feld A	| Feld B

Und ein Codeblock ohne Sprache:

```
--- BEGINN DIFF ---
--- ENDE DIFF ---
```
