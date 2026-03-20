#!/usr/bin/env python3
"""
Net Worth Dashboard - Flask + SQLite
Run: python app.py
"""

import sqlite3
import json
import os
import sys
import webbrowser
import threading
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), "networth.db")

ASSET_CLASSES = [
    "Cash & bank",
    "Stocks & ETFs",
    "Retirement Market accounts",
    "Real estate",
    "Gold & commodities",
    "Crypto",
    "Depreciating assets",
    "Other",
]

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db

@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()

def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS assets (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT NOT NULL,
            institution TEXT NOT NULL DEFAULT '',
            class     TEXT NOT NULL,
            value     REAL NOT NULL DEFAULT 0,
            notes     TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS liabilities (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT NOT NULL,
            institution TEXT NOT NULL DEFAULT '',
            amount    REAL NOT NULL DEFAULT 0,
            notes     TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            month        TEXT NOT NULL UNIQUE,
            total_assets REAL NOT NULL,
            total_liabilities REAL NOT NULL,
            net_worth    REAL NOT NULL,
            breakdown    TEXT DEFAULT '{}',
            created_at   TEXT DEFAULT (datetime('now'))
        );
    """)
    db.commit()

    # Seed sample data if empty
    if db.execute("SELECT COUNT(*) FROM assets").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO assets (name, institution, class, value) VALUES (?,?,?,?)",
            [
                ("Chase Checking", "Chase", "Cash & bank", 18000),
                ("Fidelity 401k", "Fidelity", "Stocks & ETFs", 85000),
                ("S&P 500 ETF", "Vanguard", "Stocks & ETFs", 42000),
                ("Primary Residence", "—", "Real estate", 420000),
                ("Gold Bars", "Home Safe", "Gold & commodities", 15000),
                ("Bitcoin", "Coinbase", "Crypto", 22000),
                ("Tesla Model 3", "—", "Depreciating assets", 28000),
                ("Rolex Submariner", "—", "Depreciating assets", 11000),
            ],
        )
        db.executemany(
            "INSERT INTO liabilities (name, institution, amount) VALUES (?,?,?)",
            [
                ("Mortgage", "Wells Fargo", 310000),
                ("Car Loan", "Toyota Financial", 14000),
            ],
        )
        # Seed 9 months of snapshots
        sample_snaps = [
            ("2024-07", 590000, 340000),
            ("2024-08", 601000, 336000),
            ("2024-09", 615000, 332000),
            ("2024-10", 598000, 328000),
            ("2024-11", 624000, 324000),
            ("2024-12", 641000, 320000),
            ("2025-01", 655000, 326000),
            ("2025-02", 648000, 322000),
            ("2025-03", 671000, 318000),
        ]
        for m, a, l in sample_snaps:
            db.execute(
                "INSERT OR IGNORE INTO snapshots (month, total_assets, total_liabilities, net_worth) VALUES (?,?,?,?)",
                (m, a, l, a - l),
            )
        db.commit()
    db.close()

# ── Pages ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", asset_classes=ASSET_CLASSES)

# ── Assets API ────────────────────────────────────────────────────────────────

@app.route("/api/assets", methods=["GET"])
def get_assets():
    db = get_db()
    rows = db.execute("SELECT * FROM assets ORDER BY class, name").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/assets", methods=["POST"])
def create_asset():
    data = request.json
    db = get_db()
    cur = db.execute(
        "INSERT INTO assets (name, institution, class, value, notes) VALUES (?,?,?,?,?)",
        (data["name"], data.get("institution",""), data["class"], float(data["value"]), data.get("notes","")),
    )
    db.commit()
    row = db.execute("SELECT * FROM assets WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201

@app.route("/api/assets/<int:aid>", methods=["PUT"])
def update_asset(aid):
    data = request.json
    db = get_db()
    db.execute(
        "UPDATE assets SET name=?, institution=?, class=?, value=?, notes=?, updated_at=datetime('now') WHERE id=?",
        (data["name"], data.get("institution",""), data["class"], float(data["value"]), data.get("notes",""), aid),
    )
    db.commit()
    row = db.execute("SELECT * FROM assets WHERE id=?", (aid,)).fetchone()
    return jsonify(dict(row))

@app.route("/api/assets/<int:aid>", methods=["DELETE"])
def delete_asset(aid):
    db = get_db()
    db.execute("DELETE FROM assets WHERE id=?", (aid,))
    db.commit()
    return jsonify({"deleted": aid})

# ── Liabilities API ───────────────────────────────────────────────────────────

@app.route("/api/liabilities", methods=["GET"])
def get_liabilities():
    db = get_db()
    rows = db.execute("SELECT * FROM liabilities ORDER BY name").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/liabilities", methods=["POST"])
def create_liability():
    data = request.json
    db = get_db()
    cur = db.execute(
        "INSERT INTO liabilities (name, institution, amount, notes) VALUES (?,?,?,?)",
        (data["name"], data.get("institution",""), float(data["amount"]), data.get("notes","")),
    )
    db.commit()
    row = db.execute("SELECT * FROM liabilities WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201

@app.route("/api/liabilities/<int:lid>", methods=["PUT"])
def update_liability(lid):
    data = request.json
    db = get_db()
    db.execute(
        "UPDATE liabilities SET name=?, institution=?, amount=?, notes=?, updated_at=datetime('now') WHERE id=?",
        (data["name"], data.get("institution",""), float(data["amount"]), data.get("notes",""), lid),
    )
    db.commit()
    row = db.execute("SELECT * FROM liabilities WHERE id=?", (lid,)).fetchone()
    return jsonify(dict(row))

@app.route("/api/liabilities/<int:lid>", methods=["DELETE"])
def delete_liability(lid):
    db = get_db()
    db.execute("DELETE FROM liabilities WHERE id=?", (lid,))
    db.commit()
    return jsonify({"deleted": lid})

# ── Snapshots API ─────────────────────────────────────────────────────────────

@app.route("/api/snapshots", methods=["GET"])
def get_snapshots():
    db = get_db()
    rows = db.execute("SELECT * FROM snapshots ORDER BY month ASC").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["breakdown"] = json.loads(d["breakdown"] or "{}")
        result.append(d)
    return jsonify(result)

@app.route("/api/snapshots", methods=["POST"])
def save_snapshot():
    data = request.json
    month = data.get("month")
    db = get_db()

    assets = db.execute("SELECT * FROM assets").fetchall()
    liabilities = db.execute("SELECT * FROM liabilities").fetchall()

    total_assets = sum(r["value"] for r in assets)
    total_liabilities = sum(r["amount"] for r in liabilities)
    net_worth = total_assets - total_liabilities

    breakdown = {}
    for r in assets:
        breakdown[r["class"]] = breakdown.get(r["class"], 0) + r["value"]

    db.execute(
        """INSERT INTO snapshots (month, total_assets, total_liabilities, net_worth, breakdown)
           VALUES (?,?,?,?,?)
           ON CONFLICT(month) DO UPDATE SET
             total_assets=excluded.total_assets,
             total_liabilities=excluded.total_liabilities,
             net_worth=excluded.net_worth,
             breakdown=excluded.breakdown,
             created_at=datetime('now')""",
        (month, total_assets, total_liabilities, net_worth, json.dumps(breakdown)),
    )
    db.commit()
    row = db.execute("SELECT * FROM snapshots WHERE month=?", (month,)).fetchone()
    d = dict(row)
    d["breakdown"] = json.loads(d["breakdown"])
    return jsonify(d), 201

@app.route("/api/snapshots/<month>", methods=["DELETE"])
def delete_snapshot(month):
    db = get_db()
    db.execute("DELETE FROM snapshots WHERE month=?", (month,))
    db.commit()
    return jsonify({"deleted": month})

# ── Summary API ───────────────────────────────────────────────────────────────

@app.route("/api/summary", methods=["GET"])
def get_summary():
    db = get_db()
    assets = db.execute("SELECT * FROM assets").fetchall()
    liabilities = db.execute("SELECT * FROM liabilities").fetchall()
    total_assets = sum(r["value"] for r in assets)
    total_liabilities = sum(r["amount"] for r in liabilities)
    by_class = {}
    for r in assets:
        by_class[r["class"]] = by_class.get(r["class"], 0) + r["value"]
    return jsonify({
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "net_worth": total_assets - total_liabilities,
        "by_class": by_class,
        "asset_count": len(assets),
        "liability_count": len(liabilities),
    })

# ── Main ──────────────────────────────────────────────────────────────────────

def open_browser(port):
    threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{port}")).start()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    init_db()
    print(f"\n  Net Worth Dashboard")
    print(f"  ───────────────────────────────")
    print(f"  Running at: http://localhost:{port}")
    print(f"  Database:   {DB_PATH}")
    print(f"  Press Ctrl+C to stop\n")
    open_browser(port)
    app.run(host="0.0.0.0", port=port, debug=False)
