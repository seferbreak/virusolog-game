import express from "express";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route to build and download the single HTML file
  app.get("/api/download", (req, res) => {
    console.log("Building single HTML file...");
    exec("npm run build:single", (error, stdout, stderr) => {
      if (error) {
        console.error(`Build error: ${error.message}`);
        return res.status(500).send("Error building the file.");
      }
      
      const filePath = path.resolve(process.cwd(), "dist", "index.html");
      if (fs.existsSync(filePath)) {
        res.download(filePath, "game.html", (err) => {
          if (err) {
            console.error("Error downloading file:", err);
          }
        });
      } else {
        res.status(404).send("Compiled file not found.");
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
