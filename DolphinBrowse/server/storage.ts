import { type User, type InsertUser, type Session, type InsertSession, type ActivityLog, type InsertActivityLog, type UsageTracking, type InsertUsageTracking, type Payment, type InsertPayment } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Session methods
  getSession(id: string): Promise<Session | undefined>;
  getSessionsByUser(userId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;

  // Activity log methods
  getActivityLogsBySession(sessionId: string): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;

  // Usage tracking methods
  getUsageByUser(userId: string): Promise<UsageTracking[]>;
  getTodayUsage(userId: string): Promise<UsageTracking | undefined>;
  createOrUpdateUsage(usage: InsertUsageTracking): Promise<UsageTracking>;

  // Payment methods
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;

  // Admin methods
  getAllUsers(): Promise<User[]>;
  getAllSessions(): Promise<Session[]>;
  getStats(): Promise<any>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private activityLogs: Map<string, ActivityLog> = new Map();
  private usageTracking: Map<string, UsageTracking> = new Map();
  private payments: Map<string, Payment> = new Map();

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.firebaseUid === firebaseUid);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = {
      ...insertUser,
      id,
      isAdmin: insertUser.isAdmin ?? false,
      subscriptionTier: insertUser.subscriptionTier ?? 'trial',
      displayName: insertUser.displayName ?? null,
      photoURL: insertUser.photoURL ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Session methods
  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getSessionsByUser(userId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(session => session.userId === userId);
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const now = new Date();
    const session: Session = {
      ...insertSession,
      id,
      status: insertSession.status ?? 'pending',
      startTime: insertSession.startTime ?? null,
      endTime: insertSession.endTime ?? null,
      durationMinutes: insertSession.durationMinutes ?? 0,
      modelUsed: insertSession.modelUsed ?? 'gpt-4',
      currentUrl: insertSession.currentUrl ?? null,
      createdAt: now,
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  // Activity log methods
  async getActivityLogsBySession(sessionId: string): Promise<ActivityLog[]> {
    return Array.from(this.activityLogs.values())
      .filter(log => log.sessionId === sessionId)
      .sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
  }

  async createActivityLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const id = randomUUID();
    const log: ActivityLog = {
      ...insertLog,
      id,
      status: insertLog.status ?? 'info',
      timestamp: new Date(),
    };
    this.activityLogs.set(id, log);
    return log;
  }

  // Usage tracking methods
  async getUsageByUser(userId: string): Promise<UsageTracking[]> {
    return Array.from(this.usageTracking.values()).filter(usage => usage.userId === userId);
  }

  async getTodayUsage(userId: string): Promise<UsageTracking | undefined> {
    const today = new Date().toDateString();
    return Array.from(this.usageTracking.values()).find(
      usage => usage.userId === userId && usage.date && new Date(usage.date).toDateString() === today
    );
  }

  async createOrUpdateUsage(insertUsage: InsertUsageTracking): Promise<UsageTracking> {
    const existing = await this.getTodayUsage(insertUsage.userId);
    
    if (existing) {
      const updated = {
        ...existing,
        minutesUsed: (existing.minutesUsed || 0) + (insertUsage.minutesUsed || 0),
        sessionsCount: (existing.sessionsCount || 0) + (insertUsage.sessionsCount || 0),
        trialDaysUsed: insertUsage.trialDaysUsed ?? existing.trialDaysUsed,
        firstTrialDate: existing.firstTrialDate ?? insertUsage.firstTrialDate ?? null,
      };
      this.usageTracking.set(existing.id, updated);
      return updated;
    }

    const id = randomUUID();
    const usage: UsageTracking = {
      ...insertUsage,
      id,
      date: new Date(),
      minutesUsed: insertUsage.minutesUsed ?? 0,
      sessionsCount: insertUsage.sessionsCount ?? 0,
      trialDaysUsed: insertUsage.trialDaysUsed ?? null,
      firstTrialDate: insertUsage.firstTrialDate ?? null,
    };
    this.usageTracking.set(id, usage);
    return usage;
  }

  // Payment methods
  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.userId === userId);
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const payment: Payment = {
      ...insertPayment,
      id,
      status: insertPayment.status ?? 'pending',
      razorpayPaymentId: insertPayment.razorpayPaymentId ?? null,
      razorpayOrderId: insertPayment.razorpayOrderId ?? null,
      currency: insertPayment.currency ?? 'INR',
      subscriptionEndDate: insertPayment.subscriptionEndDate ?? null,
      createdAt: new Date(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;

    const updatedPayment = { ...payment, ...updates };
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }

  // Admin methods
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getAllSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values());
  }

  async getStats(): Promise<any> {
    const users = Array.from(this.users.values());
    const sessions = Array.from(this.sessions.values());
    const today = new Date().toDateString();

    const totalUsers = users.length;
    const activeSubscribers = users.filter(u => u.subscriptionTier === 'premium').length;
    const sessionsToday = sessions.filter(s => s.createdAt && new Date(s.createdAt).toDateString() === today).length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    const successRate = sessions.length > 0 ? ((completedSessions / sessions.length) * 100).toFixed(1) : '0';

    return {
      totalUsers,
      activeSubscribers,
      sessionsToday,
      successRate,
    };
  }
}

export const storage = new MemStorage();
