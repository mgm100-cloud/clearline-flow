import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { AuthService } from '../services/authService';

const MFASetup = ({ onSuccess, onCancel }) => {
  const [factorId, setFactorId] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const enrollStartedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-mount creating two factors
    if (enrollStartedRef.current) return;
    enrollStartedRef.current = true;

    const startEnrollment = async () => {
      try {
        const data = await AuthService.enrollMFA();
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (err) {
        console.error('❌ MFA enrollment error:', err);
        setError(err.message || 'Failed to start MFA setup. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    startEnrollment();
  }, []);

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; user can still type the secret manually
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      await AuthService.verifyMFACode(factorId, code);
      console.log('✅ MFA enrollment verified');
      await onSuccess();
    } catch (err) {
      console.error('❌ MFA verification error:', err);
      setError('Invalid code. Please check your authenticator app and try again.');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            src="/clearline-logo.jpg"
            alt="ClearLine Logo"
            className="h-12 w-auto"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Set Up Two-Factor Authentication
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Two-factor authentication is now required for all Clearline Flow accounts
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-sm text-gray-600 py-8">
              Preparing MFA setup...
            </div>
          ) : qrCode ? (
            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <p className="text-sm text-gray-700 mb-4">
                  <span className="font-medium">Step 1:</span> Scan this QR code with your
                  authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.)
                </p>
                <div className="flex justify-center bg-white p-2 border border-gray-200 rounded-md">
                  <img src={qrCode} alt="MFA QR Code" className="h-48 w-48" />
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Can't scan? Enter this key manually:
                </p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 text-xs bg-gray-100 px-2 py-1.5 rounded break-all">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="text-gray-400 hover:text-gray-600"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="mfa-setup-code" className="block text-sm font-medium text-gray-700">
                  <span className="font-medium">Step 2:</span> Enter the 6-digit code from your app
                </label>
                <div className="mt-1 relative">
                  <input
                    id="mfa-setup-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm tracking-widest"
                    placeholder="000000"
                    autoFocus
                  />
                  <ShieldCheck className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifying || code.length !== 6}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  isVerifying || code.length !== 6
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {isVerifying ? 'Verifying...' : 'Verify & Enable MFA'}
              </button>
            </form>
          ) : null}

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out and return to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MFASetup;
