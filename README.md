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
