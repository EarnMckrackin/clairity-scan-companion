const MAX_TEXT_LENGTH = 12000;
const MAX_URL_HTML_LENGTH = 160000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function script(res, body) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(body);
}

function validCallbackName(value) {
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(String(value || ''));
}

function parseJsonpRequest(req) {
  const requestUrl = new URL(req.url, 'https://clairity.local');
  const callback = requestUrl.searchParams.get('callback') || '';
  if (!validCallbackName(callback)) throw new Error('Invalid JSONP callback');

  const rawPayload = requestUrl.searchParams.get('payload') || '{}';
  if (rawPayload.length > 24000) throw new Error('Request too large');

  try {
    return { callback, payload: JSON.parse(rawPayload) };
  } catch {
    throw new Error('Invalid JSON');
  }
}

function jsonp(res, callback, body) {
  return script(res, `${callback}(${JSON.stringify(body)});`);
}

function normalizeBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_500_000) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clampScore(score) {
  return Math.max(8, Math.min(96, Math.round(score)));
}

function statusFromScore(score) {
  if (score >= 78) return { label: 'High anomaly', tone: 'concern' };
  if (score >= 50) return { label: 'Review required', tone: 'care' };
  return { label: 'Low anomaly', tone: 'ok' };
}

function evidence(label, weight, detail) {
  return { label, weight, detail };
}

function pageEvidence(category, label, weight, detail, sentiment = 'caution') {
  return { category, label, weight, detail, sentiment };
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function unique(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}=["']([^"']+)`, 'i'));
  return decodeHtml(match?.[1] || '');
}

function metaContent(html, key, value) {
  const regexes = [
    new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]+content=["']([^"']+)`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${value}["']`, 'i')
  ];
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return '';
}

function classifyHost(host) {
  const normalized = lower(host).replace(/^www\./, '');
  if (/w3schools\.com|developer\.mozilla\.org|docs\./.test(normalized)) return 'educational reference';
  if (/wikipedia\.org|britannica\.com|khanacademy\.org/.test(normalized)) return 'reference';
  if (/reddit\.com|x\.com|twitter\.com|tiktok\.com|instagram\.com|facebook\.com|threads\.net|youtube\.com/.test(normalized)) return 'social platform';
  if (/\.gov$|\.edu$/.test(normalized)) return 'institutional';
  if (/nytimes\.com|apnews\.com|reuters\.com|bbc\.com|npr\.org|theguardian\.com|washingtonpost\.com/.test(normalized)) return 'news';
  return 'general website';
}

function articleFor(value) {
  return /^[aeiou]/i.test(String(value || '')) ? 'an' : 'a';
}

function extractPageSnapshotFromHtml(html, url, metadata = {}) {
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    || metadata.title
    || '';
  const description = metaContent(html, 'name', 'description')
    || metaContent(html, 'property', 'og:description')
    || metadata.description
    || '';
  const canonical = attr(html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || '', 'href')
    || metaContent(html, 'property', 'og:url')
    || url;
  const author = metaContent(html, 'name', 'author') || metaContent(html, 'property', 'article:author') || '';
  const publishedTime = metaContent(html, 'property', 'article:published_time')
    || metaContent(html, 'name', 'date')
    || metaContent(html, 'itemprop', 'datePublished')
    || '';
  const headings = unique([...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => stripHtml(match[2])).filter((item) => item.length > 1)).slice(0, 14);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)].map((match) => decodeHtml(match[1])).slice(0, 160);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => ({
    src: attr(match[0], 'src'),
    alt: attr(match[0], 'alt')
  })).filter((item) => item.src || item.alt).slice(0, 80);
  const videoCount = (html.match(/<video\b|og:video|twitter:player/gi) || []).length;
  const codeCount = (html.match(/<pre\b|<code\b/gi) || []).length;
  const articleHtml = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || '';
  const mainHtml = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || '';
  const text = stripHtml(articleHtml || mainHtml || html).slice(0, 24000);

  return {
    url,
    title,
    description,
    canonical,
    author,
    publishedTime,
    headings,
    links,
    images,
    videoCount,
    codeCount,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    source: metadata.source || 'server-fetch',
    httpStatus: metadata.httpStatus,
    contentType: metadata.contentType,
    finalUrl: metadata.finalUrl || url
  };
}

function normalizePageSnapshot(snapshot, fallbackUrl) {
  const safe = snapshot || {};
  return {
    url: safe.url || fallbackUrl || '',
    title: String(safe.title || '').slice(0, 180),
    description: String(safe.description || '').slice(0, 420),
    canonical: safe.canonical || safe.url || fallbackUrl || '',
    author: String(safe.author || '').slice(0, 120),
    publishedTime: String(safe.publishedTime || '').slice(0, 80),
    headings: unique(safe.headings || []).slice(0, 14),
    links: unique((safe.links || []).map((item) => typeof item === 'string' ? item : item.href)).slice(0, 160),
    images: (safe.images || []).map((item) => ({
      src: String(item.src || '').slice(0, 400),
      alt: String(item.alt || '').slice(0, 180),
      width: item.width || null,
      height: item.height || null
    })).slice(0, 80),
    videoCount: Number(safe.videoCount || 0),
    codeCount: Number(safe.codeCount || 0),
    text: String(safe.text || '').replace(/\s+/g, ' ').trim().slice(0, 24000),
    wordCount: Number(safe.wordCount || String(safe.text || '').split(/\s+/).filter(Boolean).length),
    source: safe.source || 'browser-snapshot',
    httpStatus: safe.httpStatus,
    contentType: safe.contentType,
    finalUrl: safe.finalUrl || safe.url || fallbackUrl || ''
  };
}

function detectUrgency(text) {
  return /(share|forward|send).{0,20}(now|fast|before|urgent)|urgent|breaking|they don't want you to know|before it disappears|limited time|act now/i.test(text);
}

function detectSourceLanguage(text) {
  return /(according to|reported by|source:|via |published|study|court|agency|official|press release|archive)/i.test(text);
}

function summarizeSignals(signals) {
  if (!signals.length) {
    return 'We did not find strong warning signs in this diagnostic audit. Still check the source before sharing.';
  }
  const supportive = signals.filter((item) => item.sentiment === 'supportive').slice(0, 2);
  const cautions = signals.filter((item) => item.sentiment !== 'supportive').slice(0, 2);
  if (supportive.length && !cautions.length) {
    return `This looks low-risk in the diagnostic audit: ${supportive.map((item) => item.label.toLowerCase()).join(' and ')}.`;
  }
  const top = signals.slice(0, 2).map((item) => item.label.toLowerCase()).join(' and ');
  return `We noticed ${top}. That does not prove AI involvement, but it is worth checking before sharing.`;
}

async function fetchPageSnapshot(url) {
  const metadata = {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Verax-preview-auditor/1.0'
      }
    });
    metadata.httpStatus = response.status;
    metadata.finalUrl = response.url;
    metadata.contentType = response.headers.get('content-type') || 'unknown';

    if (!response.ok) {
      return { snapshot: null, metadata, error: `The page returned HTTP ${response.status}.` };
    }

    const contentType = metadata.contentType;
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { snapshot: null, metadata, error: `The response type was ${contentType}.` };
    }

    const html = (await response.text()).slice(0, MAX_URL_HTML_LENGTH);
    const snapshot = extractPageSnapshotFromHtml(html, response.url, metadata);
    metadata.title = snapshot.title;
    metadata.description = snapshot.description;
    metadata.imageCount = snapshot.images.length;
    metadata.videoCount = snapshot.videoCount;
    return { snapshot, metadata, error: '' };
  } catch (error) {
    metadata.error = error.name === 'AbortError' ? 'Timed out while reading page' : error.message;
    return { snapshot: null, metadata, error: 'The page may block automated reading or took too long to respond.' };
  } finally {
    clearTimeout(timeout);
  }
}

function scorePageProfile(snapshot, parsed, fetchError = '') {
  const host = lower(parsed.hostname);
  const hostType = classifyHost(host);
  const text = [snapshot?.title, snapshot?.description, snapshot?.headings?.join(' '), snapshot?.text].filter(Boolean).join(' ');
  const textLower = lower(text);
  const signals = [];
  const reportSections = [];
  const metrics = {
    sourceConfidence: 45,
    contentRisk: 28,
    mediaRisk: 22,
    contextCompleteness: 35,
    scanConfidence: snapshot ? 70 : 28
  };

  if (parsed.protocol === 'https:') {
    metrics.sourceConfidence += 12;
    signals.push(pageEvidence('Source identity', 'HTTPS page', 'Support', 'The page uses HTTPS, which supports basic transport integrity.', 'supportive'));
  } else {
    metrics.sourceConfidence -= 18;
    metrics.contentRisk += 8;
    signals.push(pageEvidence('Source identity', 'Not HTTPS', 'Medium', 'Non-HTTPS pages provide weaker source and integrity signals.'));
  }

  if (hostType === 'educational reference' || hostType === 'reference' || hostType === 'institutional') {
    metrics.sourceConfidence += 24;
    metrics.contentRisk -= 12;
    signals.push(pageEvidence('Source identity', `${hostType[0].toUpperCase()}${hostType.slice(1)} source`, 'Support', `The domain pattern fits ${articleFor(hostType)} ${hostType} page rather than a viral post.`, 'supportive'));
  } else if (hostType === 'social platform') {
    metrics.contentRisk += 16;
    metrics.contextCompleteness -= 12;
    signals.push(pageEvidence('Source identity', 'Social platform context', 'Medium', 'Social posts are often reposted without original source context.'));
  } else if (hostType === 'news') {
    metrics.sourceConfidence += 10;
    signals.push(pageEvidence('Source identity', 'News/source domain recognized', 'Support', 'The domain matches a known publisher pattern; still check author/date for the specific page.', 'supportive'));
  }

  if (fetchError) {
    metrics.scanConfidence -= 34;
    metrics.contextCompleteness -= 22;
    metrics.contentRisk += hostType === 'social platform' ? 14 : 7;
    signals.push(pageEvidence('Scan coverage', 'Page could not be read clearly', 'Medium', fetchError));
  }

  if (snapshot) {
    if (snapshot.title) {
      metrics.contextCompleteness += 8;
      signals.push(pageEvidence('Page purpose', 'Readable page title', 'Support', `Title found: “${snapshot.title.slice(0, 90)}”.`, 'supportive'));
    }
    if (snapshot.description) {
      metrics.contextCompleteness += 8;
      signals.push(pageEvidence('Page purpose', 'Readable page description', 'Support', snapshot.description.slice(0, 150), 'supportive'));
    }
    if (snapshot.headings.length >= 3) {
      metrics.contextCompleteness += 10;
      metrics.contentRisk -= 6;
      signals.push(pageEvidence('Page structure', 'Structured headings found', 'Support', `Found ${snapshot.headings.length} headings, which helps identify page purpose.`, 'supportive'));
    }
    if (snapshot.codeCount >= 2 || /tutorial|reference|example|learn|syntax|html|css|javascript/i.test(text)) {
      metrics.contentRisk -= 12;
      signals.push(pageEvidence('Page purpose', 'Educational/reference structure', 'Support', 'The page looks like instruction or reference content rather than a viral media claim.', 'supportive'));
    }
    if (snapshot.author || snapshot.publishedTime) {
      metrics.contextCompleteness += 10;
      signals.push(pageEvidence('Context completeness', 'Author/date signal found', 'Support', [snapshot.author && `Author: ${snapshot.author}`, snapshot.publishedTime && `Date: ${snapshot.publishedTime}`].filter(Boolean).join(' · '), 'supportive'));
    } else if (!['educational reference', 'reference'].includes(hostType)) {
      metrics.contextCompleteness -= 10;
      signals.push(pageEvidence('Context completeness', 'No clear author or date found', 'Medium', 'For news or social claims, missing author/date context makes verification harder.'));
    }
    if (snapshot.images.length) {
      metrics.mediaRisk += Math.min(14, Math.ceil(snapshot.images.length / 8) * 4);
      const altCount = snapshot.images.filter((image) => image.alt).length;
      signals.push(pageEvidence('Media found', `${snapshot.images.length} image${snapshot.images.length === 1 ? '' : 's'} found`, 'Low', `${altCount} include alt/caption text. Media-heavy pages may need image-specific checking.`, snapshot.images.length > 12 ? 'caution' : 'supportive'));
    } else {
      metrics.mediaRisk -= 8;
      signals.push(pageEvidence('Media found', 'No prominent images detected', 'Support', 'This audit is mostly about page/source context, not image manipulation.', 'supportive'));
    }
    if (snapshot.videoCount) {
      metrics.mediaRisk += 12;
      signals.push(pageEvidence('Media found', 'Video or embedded player found', 'Medium', 'Video content may need frame/audio analysis beyond this page audit.'));
    }
  }

  if (detectUrgency(text)) {
    metrics.contentRisk += 20;
    signals.push(pageEvidence('Content language', 'Urgent sharing language', 'High', 'The wording pushes people to share quickly before checking the source.'));
  } else if (snapshot && snapshot.wordCount > 40) {
    metrics.contentRisk -= 8;
    signals.push(pageEvidence('Content language', 'No urgent sharing language found', 'Support', 'The visible text does not pressure readers to share immediately.', 'supportive'));
  }

  if (/ai-generated|synthetic media|deepfake|made with ai|generated by ai|watermark|chatgpt/i.test(textLower)) {
    metrics.contentRisk += 16;
    signals.push(pageEvidence('AI/media clues', 'AI or synthetic-media wording appears', 'High', 'The page text mentions AI generation, deepfakes, synthetic media, or generated content.'));
  }
  if (/repost|viral|shared from|originally posted|via @|credit:/i.test(textLower)) {
    metrics.contextCompleteness -= 7;
    metrics.contentRisk += 8;
    signals.push(pageEvidence('Context completeness', 'Repost or credit language appears', 'Medium', 'The page may be showing a copy rather than the original source.'));
  }

  Object.keys(metrics).forEach((key) => {
    metrics[key] = Math.max(0, Math.min(100, Math.round(metrics[key])));
  });

  const riskScore = clampScore(
    52
    - metrics.sourceConfidence * 0.22
    + metrics.contentRisk * 0.38
    + metrics.mediaRisk * 0.18
    - metrics.contextCompleteness * 0.16
    - metrics.scanConfidence * 0.10
  );

  reportSections.push({
    title: 'Source identity',
    detail: `${parsed.hostname} looks like ${articleFor(hostType)} ${hostType}. ${parsed.protocol === 'https:' ? 'HTTPS is present.' : 'HTTPS is not present.'}`
  });
  reportSections.push({
    title: 'Page purpose',
    detail: snapshot
      ? [snapshot.title && `Title: ${snapshot.title}`, snapshot.description && `Description: ${snapshot.description}`, snapshot.headings.length && `Headings sampled: ${snapshot.headings.slice(0, 4).join(' · ')}`].filter(Boolean).join(' ')
      : 'Verax could not extract visible page content from the server-side audit.'
  });
  reportSections.push({
    title: 'Media and claims',
    detail: snapshot
      ? `${snapshot.images.length} image(s), ${snapshot.videoCount} video/player signal(s), ${snapshot.wordCount} visible words sampled.`
      : 'Use the browser probe to audit visible text directly from the page if the server cannot read it.'
  });

  return { signals, reportSections, metrics, riskScore, hostType };
}

function summarizePageResult(status, profile, snapshot, parsed) {
  const hostType = profile.hostType;
  if (!snapshot) {
    if (status.tone === 'ok') {
      return `${parsed.hostname} looks like ${articleFor(hostType)} ${hostType}, but Verax could not read the page content directly. Use the browser probe for a stronger audit of visible text and media.`;
    }
    return `Verax could not read the page content directly from ${parsed.hostname}. The URL/context still suggests a cautious check, but use the browser probe for a stronger page audit.`;
  }
  if (status.tone === 'ok') {
    if (hostType === 'educational reference' || hostType === 'reference') {
      return 'This looks like a stable educational/reference page. We found HTTPS, readable structure, and no urgent sharing language. This audit does not verify every code example.';
    }
    return 'This page has several trust-supporting signals and no strong warning signs in the diagnostic audit. Still check details before relying on it.';
  }
  const caution = profile.signals.find((item) => item.sentiment !== 'supportive');
  const support = profile.signals.find((item) => item.sentiment === 'supportive');
  return [caution && `Main caution: ${caution.label.toLowerCase()}.`, support && `Helpful context: ${support.label.toLowerCase()}.`, 'This does not prove AI involvement; it tells you what to check next.'].filter(Boolean).join(' ');
}

async function analyzeUrl(payload) {
  const input = String(payload.content || payload.url || '').trim();
  const limitations = ['Webpage audits can miss content that appears only after login, paywalls, or heavy scripts.'];

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return buildResult({
      type: 'url',
      label: 'Invalid web link',
      score: 70,
      signals: [evidence('The link could not be read', 'High', 'Enter a full URL such as https://example.com/story.')],
      nextStep: 'Paste a full webpage or social post link and audit again.',
      limitations
    });
  }

  const browserSnapshot = payload.pageSnapshot ? normalizePageSnapshot(payload.pageSnapshot, parsed.href) : null;
  const fetched = browserSnapshot
    ? { snapshot: browserSnapshot, metadata: { source: 'browser-snapshot' }, error: '' }
    : await fetchPageSnapshot(parsed.href);
  const snapshot = fetched.snapshot;
  const profile = scorePageProfile(snapshot, parsed, fetched.error);
  const status = statusFromScore(profile.riskScore);

  return buildResult({
    type: 'url',
    label: snapshot?.title || fetched.metadata.title || parsed.hostname,
    score: profile.riskScore,
    signals: profile.signals,
    summary: summarizePageResult(status, profile, snapshot, parsed),
    nextStep: status.tone === 'ok'
      ? 'Use normal care: cite the page directly and verify any important claims with a second source.'
      : 'Check the original source, author/date, and any media captions before sharing or relying on this page.',
    metadata: {
      ...fetched.metadata,
      page: snapshot ? {
        title: snapshot.title,
        description: snapshot.description,
        canonical: snapshot.canonical,
        author: snapshot.author,
        publishedTime: snapshot.publishedTime,
        headings: snapshot.headings,
        imageCount: snapshot.images.length,
        videoCount: snapshot.videoCount,
        wordCount: snapshot.wordCount,
        source: snapshot.source
      } : null,
      metrics: profile.metrics,
      reportSections: profile.reportSections
    },
    limitations
  });
}

function weightValue(weight) {
  if (weight === 'High') return 17;
  if (weight === 'Medium') return 10;
  return 4;
}

function analyzeTextSignals(text) {
  const safeText = String(text || '').slice(0, MAX_TEXT_LENGTH);
  const signals = [];
  let scoreDelta = 0;
  const words = safeText.trim().split(/\s+/).filter(Boolean);

  if (detectUrgency(safeText)) {
    scoreDelta += 15;
    signals.push(evidence('Urgent sharing language', 'High', 'The wording pushes people to share quickly before checking the source.'));
  }
  if (!detectSourceLanguage(safeText)) {
    scoreDelta += 12;
    signals.push(evidence('No named source in the text', 'High', 'The text does not clearly say where the claim came from.'));
  }
  if (/[!?]{2,}|ALL CAPS|MUST SEE|SHOCKING/i.test(safeText)) {
    scoreDelta += 8;
    signals.push(evidence('High-emotion formatting', 'Medium', 'The text uses formatting that can pressure people to react quickly.'));
  }
  if (words.length < 8) {
    scoreDelta += 4;
    signals.push(evidence('Very little text to check', 'Low', 'A short sample gives Verax fewer context clues.'));
  }
  if (/(as an ai|language model|chatgpt|generated)/i.test(safeText)) {
    scoreDelta += 18;
    signals.push(evidence('AI-related wording appears', 'High', 'The text includes language associated with generated or AI-assisted writing.'));
  }
  if (detectSourceLanguage(safeText) && !detectUrgency(safeText)) {
    scoreDelta -= 10;
    signals.push(evidence('Source language appears', 'Low', 'The text includes words that point to a source or publication context.'));
  }

  return { scoreDelta, signals };
}

function analyzeText(payload) {
  const content = String(payload.content || '').slice(0, MAX_TEXT_LENGTH);
  const analysis = analyzeTextSignals(content);
  let score = 34 + analysis.scoreDelta;

  return buildResult({
    type: 'text',
    label: content.slice(0, 42) || 'Text audit',
    score,
    signals: analysis.signals,
    nextStep: 'Search for a dated source from a trusted outlet before sharing the claim.',
    metadata: { length: content.length, words: content.trim().split(/\s+/).filter(Boolean).length },
    limitations: ['Text audits check wording and source clues. They do not verify every factual claim.']
  });
}

function analyzeMedia(payload) {
  const media = payload.media || {};
  const mediaType = lower(payload.type || media.type || 'image').includes('audio')
    ? 'audio'
    : lower(payload.type || media.type || 'image').includes('video')
      ? 'video'
      : 'image';
  const signals = [];
  let score = mediaType === 'audio' ? 45 : mediaType === 'video' ? 42 : 40;

  if (!media.name) {
    signals.push(evidence('No filename context', 'Low', 'The file did not include a useful name to compare with the content.'));
    score += 4;
  }
  if (media.size && media.size < 30_000) {
    signals.push(evidence('Very small file', 'Medium', 'Tiny media files can hide quality clues or be heavily compressed.'));
    score += 10;
  }
  if (media.size && media.size > 40_000_000) {
    signals.push(evidence('Large media file', 'Low', 'Large media may need a slower full audit for deeper frame/audio analysis.'));
    score += 3;
  }
  if (media.width && media.height) {
    const ratio = media.width / media.height;
    if (ratio > 2.4 || ratio < 0.38) {
      signals.push(evidence('Unusual aspect ratio', 'Low', 'The dimensions are unusual and may come from a crop or generated layout.'));
      score += 5;
    } else {
      signals.push(evidence('Readable dimensions found', 'Low', `The file reports ${media.width} x ${media.height}px dimensions.`));
      score -= 5;
    }
  }

  if (media.source === 'screen-capture') {
    signals.push(evidence('Screen capture audited', 'Low', 'The image was sampled from a user-selected screen, tab, or window capture.'));
    score += 3;
  }

  if (mediaType === 'image' && media.visualStats) {
    const visual = media.visualStats;
    const hasStats = typeof visual.edgeDensity === 'number' && typeof visual.grayscaleRatio === 'number';
    if (hasStats) {
      signals.push(evidence('Image pixels checked locally', 'Low', 'Verax used aggregate texture and color statistics from your browser, not the raw image.'));
      score -= 4;

      if (visual.grayscaleRatio > 0.78 && visual.edgeDensity > 0.11 && visual.luminanceStd > 42) {
        signals.push(evidence('Black-and-white photo texture', 'Low', 'The image has monochrome grain and contrast patterns that fit a digitized or archival photo.'));
        score -= 18;
      } else if (visual.grayscaleRatio > 0.78) {
        signals.push(evidence('Mostly monochrome image', 'Low', 'Black-and-white images need source checks, but the color profile is not a synthetic-media warning by itself.'));
        score -= 8;
      }

      if (visual.edgeDensity > 0.18 && visual.luminanceStd > 48) {
        signals.push(evidence('Natural detail variation', 'Low', 'The audit found varied edges and texture rather than a uniformly smooth surface.'));
        score -= 8;
      }

      if (visual.smoothness > 0.52 && visual.edgeDensity < 0.105 && visual.luminanceStd < 44) {
        signals.push(evidence('Unusually smooth image texture', 'High', 'Large smooth areas with little edge variation can appear in generated or heavily edited images.'));
        score += 18;
      } else if (visual.smoothness > 0.46 && visual.edgeDensity < 0.13) {
        signals.push(evidence('Soft texture pattern', 'Medium', 'The image has smoother texture than expected, so it deserves a second look.'));
        score += 10;
      }

      if (visual.saturationMean > 0.36 && visual.highContrastDensity < 0.055) {
        signals.push(evidence('Polished color profile', 'Medium', 'High color saturation with limited hard contrast can be a sign of stylized or generated media.'));
        score += 8;
      }
    }
  }

  if (media.lastModifiedAgeDays != null && media.lastModifiedAgeDays < 1) {
    signals.push(evidence('Recently changed file', 'Medium', 'The file metadata says it was modified recently.'));
    score += media.visualStats ? 4 : 8;
  }
  if (/screenshot|screen shot|screen-shot/i.test(media.name || '')) {
    signals.push(evidence('Screenshot rather than original file', 'Medium', 'Screenshots often remove source, camera, and provenance metadata.'));
    score += 8;
  }
  if (/ai|generated|synthetic|deepfake|edited|final-v\d/i.test(media.name || '')) {
    signals.push(evidence('Filename suggests generated or edited media', 'High', 'The filename includes terms such as AI, generated, synthetic, or edited.'));
    score += 18;
  }
  if (mediaType === 'audio') {
    signals.push(evidence('Audio requires voice confirmation', 'Medium', 'This MVP checks metadata only. Confirm sensitive voice messages through another channel.'));
    score += 8;
  }
  if (mediaType === 'video') {
    signals.push(evidence('Video needs frame-level follow-up', 'Medium', 'This MVP checks file metadata only. A deeper audit would sample frames and audio.'));
    score += 7;
  }

  return buildResult({
    type: mediaType,
    label: media.name || `${mediaType} upload`,
    score,
    signals,
    nextStep: mediaType === 'audio'
      ? 'Confirm the message with the person through another channel.'
      : 'Look for the original post or source before sharing this media.',
    metadata: media,
    limitations: [media.visualStats
      ? 'Upload audits use local pixel statistics and metadata. They are useful clues, not a definitive AI detector.'
      : 'Upload audits in this MVP use browser-provided metadata only; raw files are not stored server-side.']
  });
}

function buildResult({ type, label, score, signals, summary, nextStep, metadata = {}, limitations = [] }) {
  const normalizedSignals = signals.length
    ? signals
    : [evidence('No strong warning signs found', 'Low', 'The diagnostic audit did not find strong concern signals.')];
  const finalScore = clampScore(score);
  const status = statusFromScore(finalScore);

  return {
    id: `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    type,
    label,
    score: finalScore,
    status: status.label,
    tone: status.tone,
    summary: summary || summarizeSignals(normalizedSignals),
    evidence: normalizedSignals.slice(0, 6),
    nextStep,
    metadata,
    limitations,
    privacy: {
      storedServerSide: false,
      rawInputRetained: false
    }
  };
}

async function runScan(payload) {
  const type = lower(payload.type || payload.sourceKind || 'text');

  if (type === 'url' || type === 'link' || payload.url) {
    return analyzeUrl(payload);
  }
  if (type === 'image' || type === 'video' || type === 'audio' || payload.media) {
    return analyzeMedia(payload);
  }
  return analyzeText(payload);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (req.method === 'GET') {
    let callback;
    try {
      const request = parseJsonpRequest(req);
      callback = request.callback;
      const result = await runScan(request.payload);
      return jsonp(res, callback, { result });
    } catch (error) {
      if (callback) return jsonp(res, callback, { error: error.message || 'Audit failed' });
      return script(res, '/* Invalid Verax JSONP request */');
    }
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST /api/scan' });

  try {
    const payload = await normalizeBody(req);
    const result = await runScan(payload);
    return json(res, 200, { result });
  } catch (error) {
    return json(res, error.message === 'Request too large' ? 413 : 400, {
      error: error.message || 'Audit failed'
    });
  }
};
