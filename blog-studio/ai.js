// ChatGPT (OpenAI) + Gemini over plain REST. Keys come from the environment only and are
// never sent to the browser.

export const providers = () => ({ openai: Boolean(process.env.OPENAI_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY) });

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(170_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `AI provider returned ${r.status}`), { status: 502 });
  return j;
}

export async function llm(provider, system, user, { json = true, maxTokens = 8000 } = {}) {
  if (!providers()[provider]) throw Object.assign(new Error(`${provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} is not set in blog-studio/.env.`), { status: 400 });
  let text;
  if (provider === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': process.env.GEMINI_API_KEY }, {
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, ...(json ? { responseMimeType: 'application/json' } : {}) },
    });
    text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  } else {
    const j = await post('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
      model: process.env.OPENAI_MODEL || 'gpt-4o', max_completion_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    text = j.choices?.[0]?.message?.content || '';
  }
  if (!text.trim()) throw Object.assign(new Error('The AI returned an empty response. Try again.'), { status: 502 });
  if (!json) return text.trim();
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  try { return JSON.parse(m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { throw Object.assign(new Error('The AI response was not valid JSON. Try again.'), { status: 502 }); }
}

const RULES = `You write for Click2Client Media, a digital marketing, SEO and website agency in Madurai, India (founder: Hari). Rules you must follow:
- Original, specific, human-sounding writing with practical examples. No filler, no repeated phrasing, no clichés like "in today's digital landscape".
- Use the primary keyword naturally. Never stuff keywords.
- NEVER invent statistics, studies, quotes, case results or sources. Include a number only if you are certain it is accurate AND you name its source. If unsure, describe qualitatively and add the claim to "needsSources".
- External source suggestions must be real, well-known publishers or official documentation (e.g. Google Search Central). Give a URL only if you are certain it exists; otherwise leave url empty. The author will verify every source before citing.
- Article body is Markdown subset: "## " H2, "### " H3, "- " lists, "1. " numbered lists, "| a | b |" tables, **bold**, [text](url). Do NOT include an H1 (the title is the H1). Do not use the headings "Introduction" or "Conclusion" — name them descriptively.
- Open with a 2-3 sentence introduction that uses the keyword and states what the reader will learn, then the first H2 must start with a direct answer of at most 50 words.
- Put a clear one-sentence definition of the core concept early.
- Use at least 2 H2 sections with H3s where useful, at least one heading phrased as a question, end with a short practical conclusion and a CTA to Click2Client Media (link to /enquire).`;

export async function generate(provider, { topic, keyword, secondary, intent, audience, sitePages }) {
  const user = `Write a complete blog article.
Topic: ${topic}
Primary keyword: ${keyword}
Secondary keywords: ${secondary || '(none)'}
Search intent: ${intent || 'informational'}
Target audience: ${audience || 'small business owners in India'}
Existing site pages you may link to internally (use 2-4 that are genuinely relevant, as Markdown links with these exact paths):
${sitePages.map((p) => `- ${p.url} — ${p.title}`).join('\n')}

Return ONLY JSON with this shape:
{"title":"SEO-friendly title containing the keyword","slug":"short-keyword-slug","metaTitle":"30-60 chars","metaDescription":"70-160 chars","excerpt":"1-2 sentence summary (max 280 chars)","outline":["H2/H3 outline lines"],"body":"full article markdown","faqs":[{"q":"question","a":"answer under 50 words, supported by the article"}],"keywords":["related keyword suggestions"],"tags":["3-6 tags"],"category":"one category","internalLinks":[{"anchor":"","url":"","reason":""}],"externalSources":[{"name":"","url":"","why":""}],"needsSources":["any claim that needs a verified source before publishing"]}
Include 4-6 FAQs.`;
  return llm(provider, RULES, user, { maxTokens: 10000 });
}

/** Rewrite one section (or any selected markdown) following an instruction. */
export async function rewrite(provider, { article, section, instruction }) {
  const user = `Article title: ${article.title}\nPrimary keyword: ${article.keyword}\n\nFull article for context:\n${article.body}\n\n---\nRewrite ONLY this section:\n${section}\n\nInstruction: ${instruction || 'Improve clarity, add a concrete practical example, keep the same heading level.'}\n\nReturn ONLY JSON: {"markdown":"the replacement section in the same Markdown subset"}`;
  return llm(provider, RULES, user, { maxTokens: 3000 });
}

/** Questions + short answers drawn only from the article. */
export async function faqs(provider, { article }) {
  const user = `From this article, produce 5-6 FAQs (People-Also-Ask style, conversational phrasing). Each answer must be under 50 words and supported ONLY by what the article says — add no new facts.\n\nTitle: ${article.title}\nKeyword: ${article.keyword}\n\n${article.body}\n\nReturn ONLY JSON: {"faqs":[{"q":"","a":""}],"conversational":["5 conversational search queries someone might type or speak"]}`;
  return llm(provider, RULES, user, { maxTokens: 2500 });
}

export async function improve(provider, { article, failing, panel }) {
  const user = `Article:\n${article.title}\n\n${article.body}\n\nThese ${panel.toUpperCase()} checks fail:\n${failing.map((f) => '- ' + f.label + ': ' + f.tip).join('\n')}\n\nGive specific, concrete edits (quote the sentence to change and the replacement). Never add invented statistics or sources. Return ONLY JSON: {"suggestions":[{"issue":"","fix":""}]}`;
  return llm(provider, RULES, user, { maxTokens: 2500 });
}
