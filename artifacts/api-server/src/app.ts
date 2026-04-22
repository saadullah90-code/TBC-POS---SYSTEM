import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api", router);

if (isProd) {
  const candidates = [
    path.resolve(process.cwd(), "artifacts/pos-system/dist/public"),
    path.resolve(process.cwd(), "artifacts/pos-system/dist"),
    path.resolve(process.cwd(), "../pos-system/dist/public"),
    path.resolve(process.cwd(), "../pos-system/dist"),
    path.resolve(process.cwd(), "../../artifacts/pos-system/dist/public"),
  ];
  const staticDir = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));

  if (staticDir) {
    logger.info({ staticDir }, "Serving static frontend");
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    logger.warn({ tried: candidates }, "Frontend dist not found, static serving disabled");
  }
}

export default app;
