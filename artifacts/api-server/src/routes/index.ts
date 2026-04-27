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

// Public / always-allowed (license must NOT block these so the owner can
// always reactivate, and staff can still log out cleanly):
router.use(healthRouter);
router.use(authRouter);
router.use(ownerRouter);
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
