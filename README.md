# Finance Tracker

Self-hosted money dashboard that matches OST Planner: a monthly check-in, the plan (recurring bills and category budgets), a bills calendar, a Puerto Rico tax estimate and a ledger for money lent. It runs in Docker on your own computer and saves everything as plain files.

## What you need

- **Docker**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Mac (open it once so it's running).
- **git**, if you install from GitHub.

## Install

```sh
cd ~/Documents
git clone <this repo's URL> finance-tracker
cd finance-tracker
docker compose up -d --build
```

Open **http://localhost:4440**. A new install starts with a few categories and nothing else. To bring in your own starting data (accounts, income, bills and so on), click **$ Finance** in the sidebar, choose **Restore from backup**, and pick your starting file (a Finance Tracker backup .json). You can also add everything by hand with the **Edit** buttons.

Personal data never goes in this repo. It lives in `data/` (ignored by git) and in the backup files you download.

OST Planner uses port 1820 and this app uses 4440, so both can run at the same time.

## Update

```sh
cd ~/Documents/finance-tracker
git pull
docker compose up -d --build
```

Your data lives in `data/`, which git never touches.

## Everyday commands

Run these from inside the app's folder.

- Stop: `docker compose down`
- Start again: `docker compose up -d`
- Port 4440 taken: change `"4440:4440"` in `docker-compose.yml` to, say, `"8091:4440"`.
- Open from your phone on the same Wi-Fi: `http://<this-computer's-IP>:4440`
- Only reachable from this computer: change the port line to `"127.0.0.1:4440:4440"`.

## The monthly routine (about 15 minutes)

At the first weekly review of each month, open **Monthly check-in** for the month that just ended (use ‹ to go back one month):

1. Balances: checking, plus each card's statement balance.
2. Income received.
3. Spending per category, taken from the statement totals.
4. Anything lent or paid back goes in the Ledger. Then **Save**.

## Bills in Apple Calendar

Calendar screen › **See bills in Apple Calendar**. Subscribe to `http://<computer>:4440/calendar.ics` once. Every bill with a due day appears in Calendar (and in Parchment), with an alert the day before. It updates from this app, so you enter each due date only once.

- Mac: Calendar › File › New Calendar Subscription, and paste the address.
- iPhone: Settings › Calendar › Accounts › Add Account › Other › Add Subscribed Calendar. The phone only refreshes when it can reach this computer, which usually means on home Wi-Fi.

## Where your data lives

- `data/state/*.json`: one file per list (accounts, income, categories, bills, months, ledger, goals, settings)
- `data/backups/`: a copy made automatically before each restore

To keep the data somewhere else, copy `.env.example` to `.env`, set `FIN_DATA_DIR` to a full path, and run `docker compose up -d`.

## Backups

Click **$ Finance** at the top of the sidebar:

- **Download backup**: one .json file with everything.
- **Restore from backup**: replaces everything. The current data is saved to `data/backups/` first.

## Taxes tab: what it assumes

- You're a bona fide resident of Puerto Rico, single, with no dependents. Wages are taxed by Hacienda. Social Security (6.2%) and Medicare (1.45%) apply.
- Current law (checked October 2026): $3,500 personal exemption; 0% up to $9,000, 7% to $25,000, 14% to $41,500, 25% to $61,500, then 33%.
- PS 912 (the 2026 reform proposal) is available as a toggle. It was still a bill as of the latest sources found, so check its status before relying on it.
- Each employer's withholding is estimated by annualizing the monthly pay and subtracting the exemption, the way payroll does. That's why several part-time jobs can each withhold $0 even when the total is taxable.
- Not modeled: deductions, credits (including the crédito por trabajo) and SINOT. It's a planning estimate, not tax advice.

## Layout

- `server/server.js`: web server, `/api/state`, backup and restore, `/calendar.ics` (Node 22, no npm packages)
- `public/index.html`: page shell and every screen's layout
- `public/js/app.js`: drawing and behavior for all screens
- `public/js/store.js`: saving to the server
- `public/js/seed.js`: first-launch data
- `public/css/app.css`: styles; colors are variables on `:root`, dark mode follows the system

## Known limits

- No login. Anyone on your network who can reach port 4440 can see and change everything. Run it only on a home network, or bind it to 127.0.0.1.
- No automated tests. Check a change by clicking through the screens.
- Weekly bills count toward the totals but don't appear on the calendar, because they have no single due day.
