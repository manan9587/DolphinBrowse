import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

import { storage } from "./storage";
import { verifyFirebaseToken } from "./services/auth";
import { createRazorpayOrder, verifyRazorpayPayment } from "./services/payment";
import { sendEmail } from "./services/email";

import {
  insertUserSchema,
  insertSessionSchema,
  insertPaymentSchema,
} from "@shared/schema";

import { subscribe, unsubscribe, broadcast } from "./services/websocket-manager";
import { files } from "./routes.files";

/** Helper: POST JSON using global fetch, or node-fetch if not present */
async function postJSON(url: string, body: unknown): Promise<Response> {
  const f: typeof fetch =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch ??
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ((await import("node-fetch")).default as any);
  return f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // ——— WebSocket server (fan-out by sessionId) ———
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "subscribe" && msg.sessionId) {
          subscribe(msg.sessionId, ws);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      unsubscribe(ws);
    });
  });

  // File routes (upload/analyze)
  app.use(files);

  // ——— Back-compat thin wrappers for older UI (/api/agent/*) ———
  app.post("/api/agent/start", async (req, res) => {
    try {
      const { sessionId, task, model, maxSeconds } = req.body || {};
      if (!sessionId || !task) return res.status(400).json({ error: "BAD_REQUEST" });

      const r = await postJSON("http://localhost:8001/start-session", {
        sessionId,
        task: task, // Python expects "task" or "taskDescription" depending on build; send both
        taskDescription: task,
        model,
        maxSeconds,
      });
      if (!r.ok) {
        return res.status(500).json({ error: "PY_ERROR" });
      }
      res.json(await r.json());
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "START_FAILED" });
    }
  });

  app.post("/api/agent/stop", async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: "BAD_REQUEST" });
      await postJSON("http://localhost:8001/stop-session", { sessionId });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "STOP_FAILED" });
    }
  });

  app.post("/api/agent/pause", async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: "BAD_REQUEST" });
      await postJSON("http://localhost:8001/pause-session", { sessionId });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "PAUSE_FAILED" });
    }
  });

  app.post("/api/agent/resume", async (req, res) => {
    try {
      const { sessionId, maxSeconds } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: "BAD_REQUEST" });
      await postJSON("http://localhost:8001/resume-session", { sessionId, maxSeconds });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "RESUME_FAILED" });
    }
  });

  // ——— Auth ———
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { token, email, displayName, photoURL, firebaseUid } = req.body;
      const decodedToken = await verifyFirebaseToken(token);

      if (decodedToken.uid !== firebaseUid) {
        return res.status(401).json({ message: "Invalid token" });
      }

      let user = await storage.getUserByFirebaseUid(firebaseUid);
      if (!user) {
        const userData = insertUserSchema.parse({
          email,
          displayName,
          photoURL,
          firebaseUid,
        });
        user = await storage.createUser(userData);
      }

      res.json(user);
    } catch (error) {
      console.error("Auth verification error:", error);
      res.status(401).json({ message: "Authentication failed" });
    }
  });

  // ——— Sessions ———
  app.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertSessionSchema.parse(req.body);

      // Trial gating (IST window)
      const nowIst = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
      const today = nowIst.toISOString().substring(0, 10);
      const todayUsage = await storage.getUsageByDate(sessionData.userId, today);
      const distinctDays = await storage.getDistinctUsageDaysLast30(
        sessionData.userId
      );
      const user = await storage.getUser(sessionData.userId);

      if (user?.subscriptionTier === "trial") {
        if (todayUsage && (todayUsage.minutesUsed || 0) >= 15) {
          return res.status(429).json({ message: "Daily trial limit reached" });
        }
        if (distinctDays.length >= 5) {
          return res.status(429).json({ message: "Trial days exhausted" });
        }
      }

      const session = await storage.createSession(sessionData);

      // Ask Python backend to start
      try {
        const r = await postJSON("http://localhost:8001/start-session", {
          sessionId: session.id,
          taskDescription: session.taskDescription,
          model: session.modelUsed,
        });

        if (r.ok) {
          await storage.updateSession(session.id, { status: "running" });

          await storage.createActivityLog({
            sessionId: session.id,
            message: "Browser automation session started",
            status: "success",
          });

          broadcast(session.id, {
            type: "status",
            data: { status: "running" },
            timestamp: new Date().toISOString(),
          });
        } else {
          console.error("Python /start-session failed:", r.status, r.statusText);
          await storage.updateSession(session.id, { status: "failed" });
        }
      } catch (error) {
        console.error("Failed to start Python backend session:", error);
        await storage.updateSession(session.id, { status: "failed" });
      }

      res.json(session);
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(400).json({ message: "Failed to create session" });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const session = await storage.updateSession(id, updates);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Notify Python backend of status change
      if (updates.status) {
        try {
          await postJSON("http://localhost:8001/update-session", {
            sessionId: id,
            status: updates.status, // "paused" | "running" | "completed"
          });
        } catch (error) {
          console.error("Failed to update Python backend session:", error);
        }
      }

      broadcast(id, {
        type: "status",
        data: { status: updates.status },
        timestamp: new Date().toISOString(),
      });

      res.json(session);
    } catch (error) {
      console.error("Session update error:", error);
      res.status(400).json({ message: "Failed to update session" });
    }
  });

  app.get("/api/session/:id/viewport", (req, res) => {
    const { id } = req.params;
    // Proxy to Python backend stream
    res.redirect(`http://localhost:8001/viewport/${id}`);
  });

  // ——— Usage ———
  app.get("/api/usage/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const nowIst = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
      const today = nowIst.toISOString().substring(0, 10);
      const todayUsage = await storage.getUsageByDate(userId, today);
      const distinctDays = await storage.getDistinctUsageDaysLast30(userId);

      res.json({
        minutesUsed: todayUsage?.minutesUsed || 0,
        trialDaysUsed: distinctDays.length,
        firstTrialDate: distinctDays[0],
      });
    } catch (error) {
      console.error("Usage tracking error:", error);
      res.status(500).json({ message: "Failed to get usage data" });
    }
  });

  // ——— Payments ———
  app.post("/api/payments/create-order", async (req, res) => {
    try {
      const { userId, planType, amount } = req.body;

      const order = await createRazorpayOrder(amount, "INR");

      const payment = await storage.createPayment({
        userId,
        razorpayOrderId: order.id,
        amount: (amount / 100).toString(), // paise → rupees
        currency: "INR",
        status: "pending",
        planType,
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment.id,
      });
    } catch (error) {
      console.error("Payment order creation error:", error);
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        userId,
      } = req.body;

      const isValid = verifyRazorpayPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValid) {
        return res.status(400).json({ message: "Invalid payment signature" });
      }

      const payments = await storage.getPaymentsByUser(userId);
      const payment = payments.find((p) => p.razorpayOrderId === razorpay_order_id);

      if (payment) {
        await storage.updatePayment(payment.id, {
          razorpayPaymentId: razorpay_payment_id,
          status: "success",
          subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        await storage.updateUser(userId, { subscriptionTier: "premium" });

        const user = await storage.getUser(userId);
        if (user?.email) {
          try {
            await sendEmail({
              to: user.email,
              from: "noreply@agentbrowse.com",
              subject: "Welcome to AgentBrowse Premium!",
              html: `
                <h1>Thank you for upgrading to Premium!</h1>
                <p>Your subscription is now active and you have unlimited automation time.</p>
                <p>Start automating at: https://agentbrowse.com/dashboard</p>
              `,
            });
          } catch (emailError) {
            console.error("Failed to send confirmation email:", emailError);
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // ——— Webhooks from Python backend ———
  app.post("/api/webhook/activity", async (req, res) => {
    try {
      const { sessionId, message, status } = req.body;

      await storage.createActivityLog({
        sessionId,
        message,
        status: status || "info",
      });

      broadcast(sessionId, {
        type: "activity",
        data: { sessionId, message, status: status || "info" },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Activity webhook error:", error);
      res.status(500).json({ message: "Failed to process activity" });
    }
  });

  app.post("/api/webhook/viewport-update", async (req, res) => {
    try {
      const { sessionId, currentUrl } = req.body;

      await storage.updateSession(sessionId, { currentUrl });

      broadcast(sessionId, {
        type: "status",
        data: { currentUrl },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Viewport webhook error:", error);
      res.status(500).json({ message: "Failed to update viewport" });
    }
  });

  return httpServer;
}
