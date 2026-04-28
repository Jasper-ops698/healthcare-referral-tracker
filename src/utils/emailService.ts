// Email Service Configuration
// For production, this should be handled by a backend server
// This is a client-side configuration that would call a backend API

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  secure: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

// Gmail SMTP Configuration
export const GMAIL_CONFIG: EmailConfig = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  username: 'bkitib@gmail.com',
  password: 'ckxfebbvofnjumgw', // App password
  secure: true,
};

// Email templates for different notifications
export const emailTemplates = {
  welcomeUser: (name: string, role: string) => ({
    subject: 'Welcome to Healthcare Referral Tracker',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Healthcare Referral Tracker</h1>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <h2 style="color: #1e293b;">Welcome, ${name}!</h2>
          <p style="color: #64748b; line-height: 1.6;">
            Your account has been created successfully as a <strong>${role}</strong>.
          </p>
          <p style="color: #64748b; line-height: 1.6;">
            You can now log in to the system using your email address and the password provided by your administrator.
          </p>
          <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 8px;">
            <p style="color: #475569; margin: 0;">
              <strong>Login URL:</strong> <a href="#" style="color: #0ea5e9;">https://healthtrack.example.com</a>
            </p>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; background: #f1f5f9;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            This is an automated message from Healthcare Referral Tracker.
          </p>
        </div>
      </div>
    `,
  }),

  patientRegistered: (patientName: string, patientId: string, chpName: string) => ({
    subject: `Patient Registration Confirmation - ${patientId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Patient Registration</h1>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <h2 style="color: #1e293b;">Registration Successful</h2>
          <p style="color: #64748b; line-height: 1.6;">
            Patient <strong>${patientName}</strong> has been successfully registered in the system.
          </p>
          <div style="margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 8px;">
            <p style="color: #475569; margin: 5px 0;"><strong>Patient ID:</strong> ${patientId}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Registered By:</strong> ${chpName}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    `,
  }),

  referralStatusUpdate: (patientName: string, status: string, facility: string) => ({
    subject: `Referral Status Update - ${patientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Referral Update</h1>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <h2 style="color: #1e293b;">Status Update</h2>
          <p style="color: #64748b; line-height: 1.6;">
            The referral for <strong>${patientName}</strong> has been updated.
          </p>
          <div style="margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 8px;">
            <p style="color: #475569; margin: 5px 0;"><strong>New Status:</strong> ${status}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Facility:</strong> ${facility}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Updated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `,
  }),

  passwordReset: (name: string, _resetToken: string) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset</h1>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <h2 style="color: #1e293b;">Hello, ${name}</h2>
          <p style="color: #64748b; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">
            If you didn't request this, please ignore this email. This link will expire in 24 hours.
          </p>
        </div>
      </div>
    `,
  }),
};

// Simulated email sending function
// In production, this would call a backend API endpoint
export const sendEmail = async (message: EmailMessage): Promise<boolean> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Log the email (for development)
  console.log('Email would be sent:', {
    from: GMAIL_CONFIG.username,
    ...message,
  });
  
  // In production, this would be:
  // const response = await fetch('/api/send-email', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ config: GMAIL_CONFIG, message }),
  // });
  // return response.ok;
  
  return true;
};

// Send welcome email to new user
export const sendWelcomeEmail = async (user: { firstName: string; email: string }, role: string): Promise<boolean> => {
  const template = emailTemplates.welcomeUser(user.firstName, role);
  return sendEmail({
    to: user.email,
    ...template,
  });
};

// Send patient registration confirmation
export const sendPatientRegistrationEmail = async (
  to: string,
  patientName: string,
  patientId: string,
  chpName: string
): Promise<boolean> => {
  const template = emailTemplates.patientRegistered(patientName, patientId, chpName);
  return sendEmail({
    to,
    ...template,
  });
};

// Export configuration for reference
export default {
  config: GMAIL_CONFIG,
  sendEmail,
  sendWelcomeEmail,
  sendPatientRegistrationEmail,
  templates: emailTemplates,
};
