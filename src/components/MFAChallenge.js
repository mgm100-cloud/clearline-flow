import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthService } from '../services/authService';

const MFAChallenge = ({ onSuccess, onCancel }) => {
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const loadFactor = async () => {
      try {
        const factors = await AuthService.listMFAFactors();
        const totpFactor = factors.totp?.[0];
        if (totpFactor) {
          setFactorId(totpFactor.id);
        } else {
          setError('No authenticator found on your account. Please contact your administrator.');
        }
      } catch (err) {
        console.error('❌ Error loading MFA factors:', err);
        setError(err.message || 'Failed to load MFA settings. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadFactor();
  }, []);

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
      console.log('✅ MFA challenge verified');
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
          Two-Factor Authentication
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter the 6-digit code from your authenticator app
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
              Loading...
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700">
                  Authentication Code
                </label>
                <div className="mt-1 relative">
                  <input
                    id="mfa-code"
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
                    disabled={!factorId}
                  />
                  <ShieldCheck className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifying || code.length !== 6 || !factorId}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  isVerifying || code.length !== 6 || !factorId
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          )}

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

export default MFAChallenge;
