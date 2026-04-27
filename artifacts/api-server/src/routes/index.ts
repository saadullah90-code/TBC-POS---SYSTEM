import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import productsRouter from "./products";
import salesRouter from "./sales";
import dashboardRouter from "./dashboard";
import printRouter from "./print";
import ownerRouter from "./owner";
import licenseRouter from "./license";
import { licenseGate } from "../lib/license-gate";

const router: IRouter = Router();

// Hidden, env-driven URL prefix for the super-admin owner panel. The
// frontend reads the same value from `VITE_OWNER_PORTAL_SLUG` — both must
// match. The default below is unguessable but you SHOULD override it in
// production via env vars so even the source code does not leak the URL.
const OWNER_SLUG = process.env.OWNER_PORTAL_SLUG || "brx-control-x9k2p7m4";

// Public / always-allowed (license must NOT block these so the owner can
// always reactivate, and staff can still log out cleanly):
router.use(healthRouter);
router.use(authRouter);
router.use(`/${OWNER_SLUG}`, ownerRouter);
router.use(licenseRouter);

// SaaS license gate. Blocks WRITES (POST/PATCH/PUT/DELETE) below if the
// active license is disabled / expired. Reads pass through so the UI under
// the LicenseGuard modal still loads quietly.
router.use(licenseGate);

// License-gated business routes:
router.use(usersRouter);
router.use(productsRouter);
router.use(salesRouter);
router.use(dashboardRouter);
router.use(printRouter);

export default router;
