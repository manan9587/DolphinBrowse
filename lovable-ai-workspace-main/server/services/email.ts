import { MailService } from '@sendgrid/mail';

const hasSendGridKey = !!process.env.SENDGRID_API_KEY;

if (!hasSendGridKey) {
  console.warn("SENDGRID_API_KEY not set, email functionality disabled");
}

const mailService = new MailService();
if (hasSendGridKey) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY!);
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!hasSendGridKey) {
    console.log('Email would be sent:', params.subject, 'to', params.to);
    return true; // Simulate successful send for development
  }
  
  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function sendWelcomeEmail(userEmail: string, userName: string) {
  return await sendEmail({
    to: userEmail,
    from: 'noreply@agentbrowse.com',
    subject: 'Welcome to AgentBrowse!',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to AgentBrowse</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 40px 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🤖 Welcome to AgentBrowse!</h1>
              <p>Your browser automation platform is ready</p>
            </div>
            <div class="content">
              <h2>Hi ${userName}!</h2>
              <p>Thank you for joining AgentBrowse. You now have access to powerful browser automation capabilities.</p>
              
              <h3>Your Free Trial Includes:</h3>
              <ul>
                <li>✅ 5 trial days within 30 days</li>
                <li>✅ 15 minutes per trial day</li>
                <li>✅ Real-time browser automation</li>
                <li>✅ Activity monitoring</li>
              </ul>
              
              <a href="https://agentbrowse.com/dashboard" class="button">Start Automating Now</a>
              
              <p>Need help? Reply to this email or visit our documentation.</p>
              
              <p>Best regards,<br>The AgentBrowse Team</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });
}

export async function sendTrialEndingSoon(userEmail: string, daysLeft: number) {
  return await sendEmail({
    to: userEmail,
    from: 'noreply@agentbrowse.com',
    subject: `Only ${daysLeft} trial days left - Upgrade to Premium`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Trial Ending Soon</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .highlight { background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Trial Ending Soon</h1>
              <p>Only ${daysLeft} days remaining in your trial</p>
            </div>
            <div class="content">
              <div class="highlight">
                <strong>Don't lose access!</strong> Your trial expires in ${daysLeft} days. Upgrade now to continue unlimited automation.
              </div>
              
              <h3>Premium Benefits:</h3>
              <ul>
                <li>🚀 Unlimited automation time</li>
                <li>🧠 Advanced AI models (GPT-4, Claude-3.5)</li>
                <li>⏸️ Pause & resume sessions</li>
                <li>📁 File processing & analysis</li>
                <li>🎯 Priority support</li>
              </ul>
              
              <a href="https://agentbrowse.com/pricing" class="button">Upgrade to Premium - ₹29/month</a>
              
              <p>Questions? Reply to this email and we'll help you choose the right plan.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });
}
