import { Resend } from 'resend';
import { requireUser, deny } from '../lib/flowAuth.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Until 2026-10-21 this was an open relay: any stranger could send any HTML, to anyone, FROM any address on our
  // sending domain. Now: a signed-in Clearline account, sending as itself (or the default sender), to a bounded list.
  const me = await requireUser(req);
  if (!me) return deny(res, 401, 'sign in required');

  try {
    const { to, subject, content, fromName = 'Clearline Flow App', fromEmail } = req.body || {};

    // Validate required fields
    if (!to || !subject || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, content' 
      });
    }

    // The sender is the CALLER (the page sends currentUser.email) or the default sender - never an address a caller makes up.
    const senderEmail = (fromEmail && String(fromEmail).trim().toLowerCase() === me.email) ? me.email : (process.env.FROM_EMAIL || 'noreply@clearlineflow.com');
    const safeName = String(fromName || 'Clearline Flow App').replace(/[\r\n<>"]/g, ' ').slice(0, 80);

    // Send email using Resend
    // Handle both single email string and array of emails
    const recipients = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
    if (!recipients.length || recipients.length > 200 || !recipients.every((x) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(x))) {
      return deny(res, 400, 'recipients must be 1 to 200 plain email addresses');
    }
    
    const data = await resend.emails.send({
      from: `${safeName} <${senderEmail}>`,
      to: recipients,
      subject: subject,
      html: content, // Content is already properly formatted HTML
    });

    console.log('Email sent successfully:', data);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      id: data.id 
    });

  } catch (error) {
    console.error('Error sending email:', error);
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to send email',
      details: error.message 
    });
  }
} 