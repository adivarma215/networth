# Net Worth Dashboard

A personal net worth tracker with a Flask backend, SQLite database, and a clean dark-themed web UI.

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the dashboard (opens browser automatically)
python app.py

# 3. Optional: specify a custom port
python app.py 8080
```

The app will:
- Create `networth.db` in the same folder on first run
- Seed sample data so the dashboard is immediately usable
- Open your browser automatically at http://localhost:5050

## Features

| Section | What you can do |
|---|---|
| **Overview** | See net worth, asset allocation pie chart, class breakdown, all holdings |
| **Trend** | Net worth chart over time, asset class line chart |
| **Assets** | Add, edit, delete individual assets with institution, class, value, notes |
| **Liabilities** | Add, edit, delete liabilities (mortgages, loans, etc.) |
| **Snapshots** | Save a monthly snapshot of current totals to build the trend history |

## Asset classes

- Cash & bank
- Stocks & ETFs
- Real estate
- Gold & commodities
- Crypto
- Depreciating assets (cars, watches, etc.)
- Other

## Database

SQLite file: `networth.db` — single file, no server needed. Back it up by copying the file.

Tables:
- `assets` — individual holdings
- `liabilities` — debts and loans
- `snapshots` — monthly net worth history
