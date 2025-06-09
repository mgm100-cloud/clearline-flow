# Email Setup with Resend and Vercel

## Environment Variables Required

### Local Development (.env.local)
```
RESEND_API_KEY=your_resend_api_key_here
FROM_EMAIL=noreply@yourdomain.com
```

### Vercel Production Environment Variables
Set these in your Vercel dashboard under Settings > Environment Variables:
- `RESEND_API_KEY` - Your Resend API key
- `FROM_EMAIL` - Your verified sender email address

## Setup Steps

1. **Get Resend API Key**
   - Go to https://resend.com/
   - Sign up for a free account
   - Get your API key from the dashboard

2. **Verify Domain (Recommended)**
   - Add your domain to Resend
   - Verify DNS records
   - Use your domain email for FROM_EMAIL

3. **Local Development**
   - Create `.env.local` file in project root
   - Add the environment variables above
   - Restart your development server

4. **Vercel Deployment**
   - Go to Vercel dashboard
   - Select your project
   - Settings > Environment Variables
   - Add RESEND_API_KEY and FROM_EMAIL
   - Redeploy your application

## API Route
The email API is available at: `/api/send-email`

**POST Request Body:**
```json
{
  "to": "recipient@email.com",
  "subject": "Email Subject",
  "content": "Email content with line breaks",
  "fromName": "Your App Name", // optional
  "fromEmail": "sender@yourdomain.com" // optional - uses user's email from profile
}
``` 