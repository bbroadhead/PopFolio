# PopFolio

A read-only Funko collection analytics dashboard for GitHub Pages. It displays a synchronized snapshot of the owner's Google Sheets collection dashboard.

## Setup

1. Enable GitHub Pages in **Settings → Pages**, with **Deploy from a branch**, `main`, `/ (root)`.
2. In **Actions**, run **Refresh collection data** once, then updates are scheduled every six hours.
3. The source Google Sheet's `Dashboard` tab must be publicly readable for the CSV export to work. Alternatively, use a restricted read-only credential in a backend; never put credentials in frontend code.

## Privacy

This repository is public. Collection valuations, counts, and purchase costs shown on the website are public. The original Google Sheet is never modified by this project.

## Data freshness

The page displays the last successful sync time. If a refresh fails, the previous snapshot is retained. Scheduled GitHub Actions workflows can be delayed.

## Individual Pop explorer
The dashboard now includes individual-item search, duplicate detection (matching franchise, name, Pop number and variant), missing-value filters, and exclusive/sticker filters. A 551-item snapshot has been seeded as three JSON chunks. Scheduled sync writes `data/pops.json`, which takes precedence over those seed files.

## Product images
Spreadsheet images are not used. Each Pop has a targeted external product-photo search link. Displaying a thumbnail automatically requires a vetted, persistent image URL in the item's `image` field. Good candidates are images from a product catalog that expressly permits API use and public display, or photos owned/licensed by the collector. Do not scrape or hotlink arbitrary copyrighted images or rely on expiring image URLs.

## Manual sync button
The page offers **Sync now** to request the publicly readable Dashboard CSV directly from Google. It updates the current browser session only, and may be blocked by browser CORS restrictions. It does not run the GitHub Actions workflow or refresh the item-level feed. The scheduled GitHub workflow remains the durable refresh mechanism.

## Collection Explorer (October 2026)

The dashboard includes a separate `features.js` module and `features.css` stylesheet to preserve the existing portfolio and search controls.

- **Gallery:** image-first cards, name/number/franchise search, retailer filtering, sorting by value/cost/ROI/name, and pagination.
- **Pop details:** click any gallery or insight card to see the original record's purchase date, retailer, variant, item price, all-in cost, market value, ROI, and duplicate count.
- **Insights:** biggest gains and losses, missing market values, duplicate copies, and image coverage.
- **Retailer analytics:** counts, total all-in cost, recorded market value, and valuation coverage by purchase retailer.
- **Wishlist and completion:** read-only Wishlist import and exact name+number matching against owned Pops. This is *wishlist completion*, not completion of an entire official Funko release catalog.
- **PWA:** manifest, app icon, and a service worker with network-first asset loading. Install using your browser's Add to Home Screen or Install option. Offline availability depends on previously cached content.

### Data updates and verification

The GitHub workflow reads Dashboard, all franchise tabs, and Wishlist. It writes `data/portfolio.json`, `data/pops.json`, and `data/wishlist.json`; it does not edit Google Sheets. The website's existing Sync button is a browser-only sync and does not persist to GitHub. After a successful GitHub Actions refresh, reload the site to receive the latest snapshot.

The image gallery displays approved image URLs when available; missing images use placeholders. Images are not guaranteed to be present for all Pops. No market history or full official-release catalog is inferred from the spreadsheet.

## New collection views (October 2026)

- **Gallery:** Searchable, paginated visual grid with retailer, value-range and sort filters. Images show when the image feed supplies an approved URL.
- **Pop details:** Click a card for a modal showing variant, retailer, purchase date, costs, market value, gain, ROI and duplicate count.
- **Insights:** Biggest winners and losses, missing values, duplicate groups and image coverage. Returns are unrealized estimates.
- **Retailers:** Counts, total all-in spending, known market value and valuation coverage by retailer.
- **Wishlist & completion:** Reads the separate Wishlist tab; exact name-and-number matches are marked owned. True franchise-completion percentages require a separate release checklist and are not fabricated.
- **PWA:** Installable using browser Add to Home Screen / Install app. Offline shell is cached; current data requires network access.

The original spreadsheet is read-only. Manual browser sync updates the current session; scheduled GitHub Actions publishes the durable snapshots. The original franchise dashboard and individual Pop search remain intact.

### Verification
Static validation confirms that app.js and sw.js parse as JavaScript, the PWA manifest and collection/wishlist snapshots are valid JSON, and 551 collection entries and 22 wishlist entries are available. Browser interactions and GitHub Pages deployment still require live smoke testing.

## Image Finder review workflow

Open **Individual Pop explorer → Find & save Pop images**. The finder can filter the collection to entries without images, advance through a review queue, and search Funko Wiki for candidate previews. It also provides a link to the official Funko catalog for manual research; **the Funko.com link is not an automated image API or scraper**.

Before saving, verify the exact character, Pop number, exclusive/chase edition, and rights to store and republish the image. Paste a direct HTTPS image URL and preview it, or choose a PNG/JPEG/WebP file and wait for its preview. The finder uploads the reviewed image to `assets/pop_images/` using a fine-grained GitHub token entered in the browser; the token is not persisted by the application. Existing filenames require an explicit overwrite confirmation. The repository image-index workflow updates the persistent index after a successful commit.

The review queue consults the Pop's image field and the existing image filename index, including non-PNG extensions. It is a convenience filter, not a definitive license or image-identity audit. Automatic Funko.com image discovery and unattended bulk imports are **not implemented**. Do not assume product images are licensed for redistribution merely because they appear on Funko.com.

### Reviewed local-image batch upload

Select multiple PNG/JPEG/WebP files in the Image Finder, click **Review batch matches**, and correct any ambiguous assignments with the per-file Pop dropdown. For each image, click **Review selected image**, inspect the preview and exact edition, confirm reuse rights for that image, then click **Approve for batch**. Enter a GitHub fine-grained token and select **Upload approved images (skip existing)**. Confirm the final upload count.

Uploads run sequentially and display counts of successful, skipped, and failed items. Existing images are skipped rather than overwritten. Failed approved items remain available for retry in the same page session. Keep the browser tab open until completion. This workflow uploads only files you selected and reviewed; it does not scrape Funko.com or grant image redistribution rights.

Batch approvals are tracked per file, including the rights confirmation made during review. Reopening or reassigning a file clears its approval. A browser reload clears pending approvals; no GitHub token is stored.
