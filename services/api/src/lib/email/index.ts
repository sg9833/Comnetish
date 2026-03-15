import { env } from '../../config/env';
import { logger } from '../logger';

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailDispatchResult = {
  provider: 'resend' | 'log';
  delivered: boolean;
  previewUrl?: string;
};

async function sendWithResend(input: SendEmailInput) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${errorBody}`);
  }

  return {
    provider: 'resend' as const,
    delivered: true
  };
}

function logEmail(input: SendEmailInput) {
  logger.info('email.preview', {
    to: input.to,
    subject: input.subject,
    text: input.text
  });

  const firstUrl = input.text.match(/https?:\/\/\S+/)?.[0];

  return {
    provider: 'log' as const,
    delivered: false,
    previewUrl: firstUrl
  };
}

export async function sendEmail(input: SendEmailInput): Promise<EmailDispatchResult> {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return sendWithResend(input);
  }

  return logEmail(input);
}

export async function sendVerificationEmail(email: string, verificationUrl: string) {
  return sendEmail({
    to: email,
    subject: 'Verify your Comnetish account',
    html: `<p>Welcome to Comnetish.</p><p>Verify your email by opening <a href="${verificationUrl}">${verificationUrl}</a>.</p>`,
    text: `Welcome to Comnetish. Verify your email by opening ${verificationUrl}`
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  return sendEmail({
    to: email,
    subject: 'Reset your Comnetish password',
    html: `<p>You requested a password reset.</p><p>Reset your password here: <a href="${resetUrl}">${resetUrl}</a>.</p>`,
    text: `You requested a password reset. Reset your password here: ${resetUrl}`
  });
}