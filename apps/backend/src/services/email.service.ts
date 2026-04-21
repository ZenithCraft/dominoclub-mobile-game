import nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(opts: MailOptions): Promise<void> {
    if (!process.env.SMTP_USER) {
      // No email configured — log in dev
      console.info('[Email] Would send to', opts.to, '|', opts.subject);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || `DominoClub <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
  }
}

export const emailService = new EmailService();
