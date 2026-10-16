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
