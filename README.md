# NovaRoom

Real-time chat platform built with FastAPI, React (Vite), and MongoDB.

---

## Getting Started

### 1. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Open `.env` and fill in your configuration values (MongoDB connection string, secrets, SMTP credentials, etc.).

---

## Running the Project

### Option A: Running with Docker (Production Mode)

Runs both the frontend (served via Nginx) and the backend (FastAPI) inside Docker containers.

1. **Start all services:**
   ```bash
   docker compose up --build -d
   ```

2. **Access the application:**
   - **Frontend:** http://localhost
   - **Backend API:** http://localhost/api

3. **View logs:**
   ```bash
   docker compose logs -f
   ```

4. **Stop the containers:**
   ```bash
   docker compose down
   ```

5. **Apply code updates:**
   ```bash
   docker compose up --build -d
   ```

---

### Option B: Running Locally (Development Mode / Instant Hot-Reload)

Runs the project directly on your machine without Docker. Any code change to frontend or backend is applied in real-time.

1. **Start both Backend and Frontend with a single command:**
   ```bash
   ./dev-run.sh
   ```

2. **Access the application:**
   - **Frontend (Vite HMR):** http://localhost:5173
   - **Backend API:** http://localhost:8000

3. **Stop development servers:**
   Press `Ctrl + C` in the terminal to cleanly terminate both processes.
