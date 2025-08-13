import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { verifyFirebaseToken } from "./services/auth";
import { createRazorpayOrder, verifyRazorpayPayment } from "./services/payment";
import { sendEmail } from "./services/email";
import { insertUserSchema, insertSessionSchema, insertActivityLogSchema, insertUsageTrackingSchema, insertPaymentSchema } from "@shared/schema";
import { z } from "zod";

// WebSocket connection tracking
const sessionConnections = new Map<string, Set<WebSocket>>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribe' && message.sessionId) {
          // Subscribe to session updates
          if (!sessionConnections.has(message.sessionId)) {
            sessionConnections.set(message.sessionId, new Set());
          }
          sessionConnections.get(message.sessionId)!.add(ws);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      // Remove from all session subscriptions
      for (const [sessionId, connections] of Array.from(sessionConnections.entries())) {
        connections.delete(ws);
        if (connections.size === 0) {
          sessionConnections.delete(sessionId);
        }
      }
    });
  });

  // Broadcast message to session subscribers
  function broadcastToSession(sessionId: string, message: any) {
    const connections = sessionConnections.get(sessionId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
    }
  }

  // Auth routes
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const { token, email, displayName, photoURL, firebaseUid } = req.body;
      
      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(token);
      
      if (decodedToken.uid !== firebaseUid) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      // Get or create user
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
      console.error('Auth verification error:', error);
      res.status(401).json({ message: 'Authentication failed' });
    }
  });

  // Session routes
  app.post('/api/sessions', async (req, res) => {
    try {
      const sessionData = insertSessionSchema.parse(req.body);
      
      // Check trial usage limits
      const todayUsage = await storage.getTodayUsage(sessionData.userId);
      const user = await storage.getUser(sessionData.userId);
      
      if (user?.subscriptionTier === 'trial') {
        if (todayUsage && (todayUsage.minutesUsed || 0) >= 15) {
          return res.status(429).json({ message: 'Daily trial limit exceeded' });
        }
      }

      const session = await storage.createSession(sessionData);
      
      // Start browser automation (call Python backend)
      try {
        const response = await fetch('http://localhost:8001/start-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            taskDescription: session.taskDescription,
            model: session.modelUsed,
          }),
        });

        if (response.ok) {
          await storage.updateSession(session.id, { status: 'running' });
          
          // Log activity
          await storage.createActivityLog({
            sessionId: session.id,
            message: 'Browser automation session started',
            status: 'success',
          });

          broadcastToSession(session.id, {
            type: 'status',
            data: { status: 'running' },
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to start Python backend session:', error);
        await storage.updateSession(session.id, { status: 'failed' });
      }

      res.json(session);
    } catch (error) {
      console.error('Session creation error:', error);
      res.status(400).json({ message: 'Failed to create session' });
    }
  });

  app.patch('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const session = await storage.updateSession(id, updates);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      // Notify Python backend of status change
      if (updates.status) {
        try {
          await fetch('http://localhost:8001/update-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: id,
              status: updates.status,
            }),
          });
        } catch (error) {
          console.error('Failed to update Python backend session:', error);
        }
      }

      broadcastToSession(id, {
        type: 'status',
        data: { status: updates.status },
        timestamp: new Date().toISOString(),
      });

      res.json(session);
    } catch (error) {
      console.error('Session update error:', error);
      res.status(400).json({ message: 'Failed to update session' });
    }
  });

  app.get('/api/session/:id/viewport', (req, res) => {
    const { id } = req.params;
    // Proxy to Python backend viewport stream
    res.redirect(`http://localhost:8001/viewport/${id}`);
  });

  // Usage tracking routes
  app.get('/api/usage/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const todayUsage = await storage.getTodayUsage(userId);
      const allUsage = await storage.getUsageByUser(userId);
      
      // Calculate trial days used
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentUsage = allUsage.filter(usage => 
        usage.date && new Date(usage.date) >= thirtyDaysAgo
      );
      
      const trialDaysUsed = recentUsage.length;
      const minutesUsed = todayUsage?.minutesUsed || 0;

      res.json({
        minutesUsed,
        trialDaysUsed,
        firstTrialDate: recentUsage[0]?.date,
      });
    } catch (error) {
      console.error('Usage tracking error:', error);
      res.status(500).json({ message: 'Failed to get usage data' });
    }
  });

  // Payment routes
  app.post('/api/payments/create-order', async (req, res) => {
    try {
      const { userId, planType, amount } = req.body;
      
      const order = await createRazorpayOrder(amount, 'INR');
      
      // Store payment record
      const payment = await storage.createPayment({
        userId,
        razorpayOrderId: order.id,
        amount: (amount / 100).toString(), // Convert from paise to rupees
        currency: 'INR',
        status: 'pending',
        planType,
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment.id,
      });
    } catch (error) {
      console.error('Payment order creation error:', error);
      res.status(500).json({ message: 'Failed to create payment order' });
    }
  });

  app.post('/api/payments/verify', async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;
      
      const isValid = verifyRazorpayPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      
      if (!isValid) {
        return res.status(400).json({ message: 'Invalid payment signature' });
      }

      // Update payment status
      const payments = await storage.getPaymentsByUser(userId);
      const payment = payments.find(p => p.razorpayOrderId === razorpay_order_id);
      
      if (payment) {
        await storage.updatePayment(payment.id, {
          razorpayPaymentId: razorpay_payment_id,
          status: 'success',
          subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        });

        // Update user subscription
        await storage.updateUser(userId, {
          subscriptionTier: 'premium',
        });

        // Send confirmation email
        const user = await storage.getUser(userId);
        if (user?.email) {
          try {
            await sendEmail({
              to: user.email,
              from: 'noreply@agentbrowse.com',
              subject: 'Welcome to AgentBrowse Premium!',
              html: `
                <h1>Thank you for upgrading to Premium!</h1>
                <p>Your subscription is now active and you have unlimited automation time.</p>
                <p>Start automating at: https://agentbrowse.com/dashboard</p>
              `,
            });
          } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ message: 'Payment verification failed' });
    }
  });

  // Admin routes
  app.get('/api/admin/stats', async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Admin stats error:', error);
      res.status(500).json({ message: 'Failed to get stats' });
    }
  });

  app.get('/api/admin/recent-activity', async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      const users = await storage.getAllUsers();
      
      const recentSessions = sessions
        .sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 10);

      const activity = recentSessions.map(session => {
        const user = users.find(u => u.id === session.userId);
        return {
          user: {
            email: user?.email,
            displayName: user?.displayName,
            subscriptionTier: user?.subscriptionTier,
          },
          action: session.taskDescription.substring(0, 50) + '...',
          duration: session.durationMinutes ? `${session.durationMinutes}:00` : '0:00',
          status: session.status,
          time: session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Unknown',
        };
      });

      res.json(activity);
    } catch (error) {
      console.error('Admin activity error:', error);
      res.status(500).json({ message: 'Failed to get recent activity' });
    }
  });

  // Python backend webhook routes for real-time updates
  app.post('/api/webhook/activity', async (req, res) => {
    try {
      const { sessionId, message, status } = req.body;
      
      // Store activity log
      await storage.createActivityLog({
        sessionId,
        message,
        status: status || 'info',
      });

      // Broadcast to connected clients
      broadcastToSession(sessionId, {
        type: 'activity',
        data: { sessionId, message, status: status || 'info' },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Activity webhook error:', error);
      res.status(500).json({ message: 'Failed to process activity' });
    }
  });

  app.post('/api/webhook/viewport-update', async (req, res) => {
    try {
      const { sessionId, currentUrl } = req.body;
      
      // Update session URL
      await storage.updateSession(sessionId, { currentUrl });

      // Broadcast viewport update
      broadcastToSession(sessionId, {
        type: 'status',
        data: { currentUrl },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Viewport webhook error:', error);
      res.status(500).json({ message: 'Failed to update viewport' });
    }
  });

  return httpServer;
}
