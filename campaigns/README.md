# Campaign packs

A campaign pack is the content pipeline as a shareable JSON file — the
chapter-0 authoring promise made real. A pack defines any of `classes`,
`chrome`, `tags`, `ice`, `enemies`; whatever it omits is inherited from the
built-in Six Houses content. Load one in the console (**IMPORT…** in the
CAMPAIGN panel); export your own with **EXPORT PACK**.

- `example-gloaming.json` — a small template: adds two Ninefields-flavoured
  enemies and a CORDON zone tag, inherits everything else. Open it in a text
  editor to see the shape, then build your own.

Pack shape:

```json
{
  "static_campaign": 1,
  "name": "Your Campaign",
  "author": "you",
  "content": {
    "enemies": [ { "id":"...", "name":"...", "hp":5, "armor":1, "fw":2,
                   "dice":2, "dmg":2, "move":"one thing it does",
                   "want":"what it pursues" } ],
    "tags":    [ { "id":"NAME", "desc":"one-sentence effect" } ]
  }
}
```

Classes, chrome, and ice follow the same schemas as the built-in content in
`js/content.js` — copy an entry from there as a starting point.
