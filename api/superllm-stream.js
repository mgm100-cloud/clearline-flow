const DEFAULT_MODE = 'deep';

const MODE_PROFILES = {
  deep: {
    openai: {
      model: process.env.OPENAI_SUPERLLM_DEEP_MODEL || 'gpt-5',
      reasoningEffort: 'high',
      label: 'GPT-5 (Deep Thinking)'
    },
    anthropic: {
      model: process.env.ANTHROPIC_SUPERLLM_DEEP_MODEL || 'claude-opus-4-6',
      maxTokens: 16000,
      thinkingType: 'adaptive',
      outputEffort: 'high',
      label: 'Claude Opus 4.6 (Deep Thinking)'
    },
    gemini: {
      model: process.env.GEMINI_SUPERLLM_DEEP_MODEL || 'gemini-3.1-pro-preview',
      thinkingLevel: 'HIGH',
      label: 'Gemini 3.1 Pro Preview (Deep Thinking)'
    }
  },
  pro: {
    openai: {
      model: process.env.OPENAI_SUPERLLM_PRO_MODEL || 'gpt-5',
      reasoningEffort: 'high',
      label: 'GPT-5 Pro'
    },
    anthropic: {
      model: process.env.ANTHROPIC_SUPERLLM_PRO_MODEL || 'claude-opus-4-6',
      maxTokens: 16000,
      thinkingType: 'adaptive',
      outputEffort: 'max',
      label: 'Claude Opus 4.6 (Pro)'
    },
    gemini: {
      model: process.env.GEMINI_SUPERLLM_PRO_MODEL || 'gemini-3.1-pro-preview',
      thinkingLevel: 'MEDIUM',
      label: 'Gemini 3.1 Pro Preview'
    }
  },
  fast: {
    openai: {
      model: process.env.OPENAI_SUPERLLM_FAST_MODEL || 'gpt-5',
      reasoningEffort: 'minimal',
      label: 'GPT-5 (Fast)'
    },
    anthropic: {
      model: process.env.ANTHROPIC_SUPERLLM_FAST_MODEL || 'claude-opus-4-6',
      maxTokens: 16000,
      thinkingType: 'adaptive',
      outputEffort: 'medium',
      label: 'Claude Opus 4.6 (Medium)'
    },
    gemini: {
      model: process.env.GEMINI_SUPERLLM_FAST_MODEL || 'gemini-3.1-flash-lite-preview',
      thinkingLevel: 'MINIMAL',
      label: 'Gemini 3.1 Flash Lite Preview'
    }
  }
};

function getProfiles(mode) {
  return MODE_PROFILES[mode] || MODE_PROFILES[DEFAULT_MODE];
}

function writeEvent(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }

  return body;
}

async function parseSSEStream(stream, onMessage) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const frame = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf('\n\n');

      if (!frame.trim()) {
        continue;
      }

      let event = 'message';
      const dataLines = [];

      frame.split('\n').forEach((line) => {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      const data = dataLines.join('\n');
      if (!data) {
        continue;
      }

      await onMessage({ event, data });
    }
  }
}

function extractOpenAIText(payload) {
  const items = Array.isArray(payload.output) ? payload.output : Array.isArray(payload.content) ? [{ content: payload.content }] : [];
  const parts = [];

  items.forEach((item) => {
    if (!Array.isArray(item.content)) {
      return;
    }

    item.content.forEach((contentPart) => {
      if (contentPart.type === 'output_text' && contentPart.text) {
        parts.push(contentPart.text);
      }
    });
  });

  return parts.join('');
}

function extractAnthropicText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('');
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates
    .flatMap((candidate) => (candidate.content?.parts || []))
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
}

async function fetchOpenAIText({ apiKey, prompt, profile }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: profile.model,
      input: prompt,
      reasoning: {
        effort: profile.reasoningEffort
      }
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${details}`);
  }

  const payload = await response.json();
  return extractOpenAIText(payload).trim();
}

async function streamOpenAIText({ apiKey, prompt, profile, onDelta }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: profile.model,
      input: prompt,
      stream: true,
      reasoning: {
        effort: profile.reasoningEffort
      }
    })
  });

  if (!response.ok || !response.body) {
    const details = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${details}`);
  }

  let text = '';

  await parseSSEStream(response.body, async ({ data }) => {
    if (data === '[DONE]') {
      return;
    }

    const payload = JSON.parse(data);

    if (payload.type === 'response.output_text.delta' && payload.delta) {
      text += payload.delta;
      onDelta(payload.delta);
      return;
    }

    if (payload.type === 'response.output_text.done' && payload.text) {
      if (!text) {
        text = payload.text;
      }
      return;
    }

    if (payload.type === 'response.content_part.done' && payload.part?.type === 'output_text' && payload.part.text) {
      if (!text) {
        text = payload.part.text;
      }
      return;
    }

    if (payload.type === 'response.output_item.done' && payload.item) {
      const itemText = extractOpenAIText({ output: [payload.item] });
      if (itemText && !text) {
        text = itemText;
      }
      return;
    }

    if (payload.type === 'response.completed' && payload.response) {
      const completedText = extractOpenAIText(payload.response);
      if (completedText && !text) {
        text = completedText;
      }
    }
  });

  if (!text.trim()) {
    return fetchOpenAIText({ apiKey, prompt, profile });
  }

  return text.trim();
}

async function streamAnthropicText({ apiKey, prompt, profile, onDelta }) {
  const payload = {
    model: profile.model,
    max_tokens: profile.maxTokens || 16000,
    stream: true,
    thinking: {
      type: profile.thinkingType || 'adaptive'
    },
    output_config: {
      effort: profile.outputEffort || 'medium'
    },
    tools: [
      { type: 'web_search_20250305', name: 'web_search' }
    ],
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    const details = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${details}`);
  }

  let text = '';

  await parseSSEStream(response.body, async ({ event, data }) => {
    if (data === '[DONE]') {
      return;
    }

    const parsed = JSON.parse(data);

    if (event === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
      text += parsed.delta.text;
      onDelta(parsed.delta.text);
      return;
    }

    if (event === 'message_stop' && parsed.message) {
      const completedText = extractAnthropicText(parsed.message);
      if (completedText && !text) {
        text = completedText;
      }
    }
  });

  return text.trim();
}

async function streamGeminiText({ apiKey, prompt, profile, onDelta }) {
  const generationConfig = {
    temperature: 0.2
  };

  if (profile.thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel: profile.thinkingLevel
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${profile.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig
      })
    }
  );

  if (!response.ok || !response.body) {
    const details = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${details}`);
  }

  let text = '';

  await parseSSEStream(response.body, async ({ data }) => {
    const payload = JSON.parse(data);
    const chunkText = extractGeminiText(payload);

    if (!chunkText) {
      return;
    }

    const delta = chunkText.startsWith(text) ? chunkText.slice(text.length) : chunkText;
    text += delta;
    onDelta(delta);
  });

  return text.trim();
}

async function runProvider({ provider, prompt, profile, keys, res, results }) {
  writeEvent(res, {
    type: 'provider-started',
    provider,
    modelLabel: profile.label
  });

  try {
    let text = '';

    if (provider === 'openai') {
      if (!keys.openai) {
        throw new Error('OPENAI_API_KEY is not configured');
      }

      text = await streamOpenAIText({
        apiKey: keys.openai,
        prompt,
        profile,
        onDelta: (delta) => {
          writeEvent(res, {
            type: 'provider-delta',
            provider,
            delta
          });
        }
      });
    }

    if (provider === 'anthropic') {
      if (!keys.anthropic) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }

      text = await streamAnthropicText({
        apiKey: keys.anthropic,
        prompt,
        profile,
        onDelta: (delta) => {
          writeEvent(res, {
            type: 'provider-delta',
            provider,
            delta
          });
        }
      });
    }

    if (provider === 'gemini') {
      if (!keys.gemini) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      text = await streamGeminiText({
        apiKey: keys.gemini,
        prompt,
        profile,
        onDelta: (delta) => {
          writeEvent(res, {
            type: 'provider-delta',
            provider,
            delta
          });
        }
      });
    }

    results[provider] = {
      ok: true,
      text
    };

    writeEvent(res, {
      type: 'provider-completed',
      provider,
      text
    });
  } catch (error) {
    results[provider] = {
      ok: false,
      text: '',
      error: error.message
    };

    writeEvent(res, {
      type: 'provider-error',
      provider,
      error: error.message
    });
  }
}

function buildSynthesisPrompt(prompt, results) {
  const openAIText = results.openai?.ok ? results.openai.text : `Unavailable: ${results.openai?.error || 'No response returned'}`;
  const anthropicText = results.anthropic?.ok ? results.anthropic.text : `Unavailable: ${results.anthropic?.error || 'No response returned'}`;
  const geminiText = results.gemini?.ok ? results.gemini.text : `Unavailable: ${results.gemini?.error || 'No response returned'}`;

  return `in response to the prompt "${prompt}", we received these responses from 3 llm's. Here they are 1 ${openAIText} 2 ${anthropicText} 3 ${geminiText}. Please use these responses to create a single encompassing response that provides the most in depth and accurate answer. Do not remove any details from the 3 responses unless there is conflicting data and you know that something is wrong.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = normalizeBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode : DEFAULT_MODE;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const profiles = getProfiles(mode);
  const keys = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  };

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  writeEvent(res, {
    type: 'session-started',
    mode,
    profiles: {
      openai: profiles.openai.label,
      anthropic: profiles.anthropic.label,
      gemini: profiles.gemini.label
    }
  });

  const results = {};

  await Promise.all([
    runProvider({
      provider: 'openai',
      prompt,
      profile: profiles.openai,
      keys,
      res,
      results
    }),
    runProvider({
      provider: 'anthropic',
      prompt,
      profile: profiles.anthropic,
      keys,
      res,
      results
    }),
    runProvider({
      provider: 'gemini',
      prompt,
      profile: profiles.gemini,
      keys,
      res,
      results
    })
  ]);

  try {
    if (!keys.openai) {
      throw new Error('OPENAI_API_KEY is not configured for synthesis');
    }

    const synthesisPrompt = buildSynthesisPrompt(prompt, results);

    writeEvent(res, {
      type: 'super-started',
      modelLabel: profiles.openai.label
    });

    const superAnswer = await streamOpenAIText({
      apiKey: keys.openai,
      prompt: synthesisPrompt,
      profile: profiles.openai,
      onDelta: (delta) => {
        writeEvent(res, {
          type: 'super-delta',
          delta
        });
      }
    });

    writeEvent(res, {
      type: 'super-completed',
      text: superAnswer
    });
  } catch (error) {
    writeEvent(res, {
      type: 'super-error',
      error: error.message
    });
  }

  writeEvent(res, { type: 'session-completed' });
  res.end();
}






