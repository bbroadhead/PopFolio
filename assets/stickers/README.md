# PopFolio stickers

Upload transparent PNG or WebP sticker artwork here. Use filenames matching the spreadsheet **Sticker** cell labels, e.g. `GameStop.png`, `Glow-in-the-Dark.webp`, `Chase.png`.

Multiple stickers: separate labels in the spreadsheet with commas or semicolons. Exact normalized filename-to-label matching prevents accidental assignment of unrelated retailer or convention stickers. The app does not infer stickers from the variant field.

Manual overrides: edit `overrides.json` using a key formatted as lowercase normalized `franchise|pop number|pop name` or the item's ID. Set the value to an array of sticker labels, e.g. `{"stranger things|1477|campaign eddie":["Convention","Limited 1000"]}`. Use `[]` to explicitly show no stickers.

Images are indexed automatically by the GitHub workflow. Transparent backgrounds are preserved; the app never removes backgrounds automatically.
