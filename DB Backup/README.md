# MongoDB Helper (Web UI)

A lightweight web-based MongoDB backup and restore/migration utility for NovaRoom.

---

## How to Run

From the project root:

```bash
"./DB Backup/run.sh"
```

Or enter the folder:

```bash
cd "DB Backup"
./run.sh
```

By default, the helper opens at: **http://localhost:5050**

To use a custom port:
```bash
PORT=8080 ./run.sh
```

---

## Features

1. **Backup Database:**
   - Enter your MongoDB URI and database name (pre-filled from `.env`).
   - Automatically dumps all collections using `mongodump` into timestamped folders inside `DB Backup/`.
2. **Restore / Migration:**
   - Select any existing backup from the dropdown or table.
   - Enter target MongoDB URI and database name.
   - Option to clean/drop collections before restoring (`--drop`).
   - Streams live console output from `mongorestore`.
3. **No External Dependencies:**
   - Pure Python standard library HTTP server with modern Tailwind CSS interface.
