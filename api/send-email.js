import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, content, fromName = 'Clearline Flow App', fromEmail } = req.body;

    // Validate required fields
    if (!to || !subject || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, content' 
      });
    }

    // Use dynamic fromEmail or fallback to environment variable
    const senderEmail = fromEmail || process.env.FROM_EMAIL || 'noreply@clearlineflow.com';

    // Send email using Resend
    const data = await resend.emails.send({
      from: `${fromName} <${senderEmail}>`,
      to: [to],
      subject: subject,
      text: content,
      html: content.replace(/\n/g, '<br>'), // Convert line breaks to HTML
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