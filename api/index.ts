import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Since Vercel handles static files automatically via the build step,
// we don't need to serve them here if we use the default Vite build.
// However, for completeness and to support the SPA fallback:
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

export default app;
