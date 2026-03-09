import React, { useEffect, useMemo, useRef, useState } from 'react';

const MODE_OPTIONS = [
  {
    value: 'deep',
    label: 'Deep thinking',
    description: 'Flagship reasoning profiles with higher thought budgets.'
  },
  {
    value: 'pro',
    label: 'Pro',
    description: 'Premium profiles when available, optimized for maximum depth.'
  },
  {
    value: 'fast',
    label: 'Non-thinking',
    description: 'Lower-latency profiles with minimal or no explicit reasoning.'
  }
];

const PROVIDERS = {
  openai: {
    label: 'ChatGPT',
    accent: 'blue'
  },
  anthropic: {
    label: 'Claude',
    accent: 'orange'
  },
  gemini: {
    label: 'Gemini',
    accent: 'emerald'
  }
};

function createInitialProviders() {
  return Object.keys(PROVIDERS).reduce((accumulator, key) => {
    accumulator[key] = {
      text: '',
      status: 'idle',
      error: '',
      modelLabel: ''
    };
    return accumulator;
  }, {});
}

function getAccentClasses(accent) {
  if (accent === 'orange') {
    return {
      badge: 'bg-orange-50 text-orange-700 border-orange-200',
      border: 'border-orange-200',
      heading: 'text-orange-700'
    };
  }

  if (accent === 'emerald') {
    return {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      border: 'border-emerald-200',
      heading: 'text-emerald-700'
    };
  }

  return {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    border: 'border-blue-200',
    heading: 'text-blue-700'
  };
}

function statusLabel(status) {
  if (status === 'streaming') {
    return 'Streaming';
  }

  if (status === 'complete') {
    return 'Complete';
  }

  if (status === 'error') {
    return 'Error';
  }

  return 'Waiting';
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function SuperLLMTab() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('deep');
  const [providers, setProviders] = useState(createInitialProviders);
  const [superAnswer, setSuperAnswer] = useState('');
  const [superStatus, setSuperStatus] = useState('idle');
  const [superError, setSuperError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const [sessionError, setSessionError] = useState('');
  const [profileLabels, setProfileLabels] = useState({});
  const [synthesisStartedAt, setSynthesisStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef(null);

  const trimmedPrompt = prompt.trim();
  const selectedMode = useMemo(
    () => MODE_OPTIONS.find((option) => option.value === mode) || MODE_OPTIONS[0],
    [mode]
  );
  const completedProviderCount = useMemo(
    () => Object.values(providers).filter((provider) => provider.status === 'complete' || provider.status === 'error').length,
    [providers]
  );

  useEffect(() => {
    if (!synthesisStartedAt || superStatus !== 'streaming') {
      setElapsedSeconds(0);
      return undefined;
    }

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - synthesisStartedAt) / 1000)));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [synthesisStartedAt, superStatus]);

  const updateProvider = (providerKey, updater) => {
    setProviders((current) => ({
      ...current,
      [providerKey]: typeof updater === 'function' ? updater(current[providerKey]) : updater
    }));
  };

  const resetState = () => {
    setProviders(createInitialProviders());
    setSuperAnswer('');
    setSuperStatus('idle');
    setSuperError('');
    setSessionError('');
    setCopyState('idle');
    setProfileLabels({});
    setSynthesisStartedAt(null);
    setElapsedSeconds(0);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!trimmedPrompt || isSubmitting) {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    resetState();
    setIsSubmitting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/superllm-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          mode
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        const details = await response.text();
        throw new Error(details || 'Unable to start SuperLLM request.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
          const rawLine = buffer.slice(0, lineBreakIndex).trim();
          buffer = buffer.slice(lineBreakIndex + 1);
          lineBreakIndex = buffer.indexOf('\n');

          if (!rawLine) {
            continue;
          }

          const payload = JSON.parse(rawLine);

          if (payload.type === 'session-started') {
            setProfileLabels(payload.profiles || {});
          }

          if (payload.type === 'provider-started') {
            updateProvider(payload.provider, (current) => ({
              ...current,
              status: 'streaming',
              error: '',
              modelLabel: payload.modelLabel || current.modelLabel
            }));
          }

          if (payload.type === 'provider-delta') {
            updateProvider(payload.provider, (current) => ({
              ...current,
              status: 'streaming',
              text: `${current.text}${payload.delta || ''}`
            }));
          }

          if (payload.type === 'provider-completed') {
            updateProvider(payload.provider, (current) => ({
              ...current,
              status: 'complete',
              text: payload.text || current.text
            }));
          }

          if (payload.type === 'provider-error') {
            updateProvider(payload.provider, (current) => ({
              ...current,
              status: 'error',
              error: payload.error || 'Provider request failed.'
            }));
          }

          if (payload.type === 'super-started') {
            setSuperStatus('streaming');
            setSynthesisStartedAt(Date.now());
          }

          if (payload.type === 'super-delta') {
            setSuperStatus('streaming');
            setSuperAnswer((current) => `${current}${payload.delta || ''}`);
          }

          if (payload.type === 'super-completed') {
            setSuperStatus('complete');
            setSuperAnswer(payload.text || '');
          }

          if (payload.type === 'super-error') {
            setSuperStatus('error');
            setSuperError(payload.error || 'Synthesis request failed.');
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setSessionError(error.message || 'SuperLLM request failed.');
      }
    } finally {
      setIsSubmitting(false);
      abortRef.current = null;
    }
  };

  const handleCopy = async () => {
    if (!superAnswer) {
      return;
    }

    try {
      await navigator.clipboard.writeText(superAnswer);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      setCopyState('error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg border border-gray-200">
        <div className="px-4 py-5 sm:p-6 space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">SuperLLM</h1>
              <p className="text-sm text-gray-600 mt-1">
                Fan a prompt out to ChatGPT, Claude, and Gemini in parallel, then synthesize a single best-answer response.
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 max-w-md">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Reasoning mode</div>
              <div className="text-sm text-blue-900 font-medium mt-1">{selectedMode.label}</div>
              <div className="text-xs text-blue-700 mt-1">{selectedMode.description}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-2">
                <label htmlFor="superllm-prompt" className="block text-sm font-medium text-gray-700">
                  Prompt
                </label>
                <textarea
                  id="superllm-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  placeholder="Type the prompt you want sent to all three models..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="superllm-mode" className="block text-sm font-medium text-gray-700 mb-2">
                    Model setting
                  </label>
                  <select
                    id="superllm-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Default is deep thinking across all providers. Pro and non-thinking switch the underlying profiles before the next run.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!trimmedPrompt || isSubmitting}
                  className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSubmitting ? 'Running SuperLLM...' : 'Send prompt'}
                </button>
              </div>
            </div>
          </form>

          {sessionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {sessionError}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(PROVIDERS).map(([providerKey, providerMeta]) => {
              const accentClasses = getAccentClasses(providerMeta.accent);
              return (
                <div key={providerKey} className={`rounded-lg border px-4 py-3 ${accentClasses.border}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`text-sm font-semibold ${accentClasses.heading}`}>
                        {providerMeta.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {providers[providerKey].modelLabel || profileLabels[providerKey] || 'Profile will appear after the run starts'}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${accentClasses.badge}`}>
                      {statusLabel(providers[providerKey].status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Super answer</h2>
              <p className="text-sm text-gray-600 mt-1">
                The synthesized answer appears here after the three provider responses finish.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!superAnswer}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy answer'}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 min-h-[180px]">
            {!superAnswer && superStatus === 'idle' && (
              <p className="text-sm text-gray-500">Submit a prompt to generate a synthesized answer here.</p>
            )}
            {superStatus === 'streaming' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
                  <p className="text-sm font-medium text-blue-700">Building the synthesized answer...</p>
                  <span className="text-xs text-blue-600">Elapsed: {formatElapsed(elapsedSeconds)}</span>
                </div>
                <div className="overflow-hidden rounded-full bg-blue-100 h-2">
                  <div className="h-2 w-1/3 rounded-full bg-blue-500 animate-pulse" />
                </div>
                <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-gray-600">
                  {completedProviderCount < 3
                    ? `Waiting for all model responses to finish (${completedProviderCount}/3 ready).`
                    : 'All three model responses are in. ChatGPT is now synthesizing the final answer.'}
                </div>
                {!superAnswer && (
                  <p className="text-sm text-gray-500">The final response will appear here as soon as synthesis starts returning text.</p>
                )}
                {superAnswer && (
                  <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{superAnswer}</div>
                )}
              </div>
            )}
            {superError && (
              <p className="text-sm text-red-600">{superError}</p>
            )}
            {superStatus !== 'streaming' && superAnswer && (
              <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{superAnswer}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {Object.entries(PROVIDERS).map(([providerKey, providerMeta]) => {
          const accentClasses = getAccentClasses(providerMeta.accent);
          return (
            <div key={providerKey} className="bg-white shadow rounded-lg border border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{providerMeta.label}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {providers[providerKey].modelLabel || profileLabels[providerKey] || 'Awaiting run'}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${accentClasses.badge}`}>
                    {statusLabel(providers[providerKey].status)}
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 min-h-[320px]">
                  {providers[providerKey].error ? (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-red-600">{providers[providerKey].error}</p>
                  ) : providers[providerKey].text ? (
                    <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{providers[providerKey].text}</div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {providers[providerKey].status === 'streaming'
                        ? 'Waiting for streamed text...'
                        : 'This provider response will appear here.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
