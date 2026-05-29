// Maps a provenance result into an honest, plain-language verdict.
//
// Design rule for the audience (kids and grandparents): never show a precise-
// looking risk number that the tool can't actually back up. There are only three
// things we can truthfully say, plus a confident "this is AI" when credentials
// disclose it:
//
//   verified  🟢  We confirmed where this came from.
//   ai        🟣  The file itself says it was made or edited with AI.
//   altered   🔴  It carries credentials, but they don't match the file.
//   unproven  ⚪  We could not confirm anything either way. (the honest default)
//
// "unproven" is the common case and is NOT a warning — it means "we don't know,
// here is how you can check." That is far safer than a fake confidence score.

export const VERDICTS = {
  verified: {
    state: 'verified',
    icon: '✓',
    tone: 'ok',
    title: 'Verified origin',
    badge: 'Content Credentials check'
  },
  ai: {
    state: 'ai',
    icon: 'AI',
    tone: 'concern',
    title: 'Made or edited with AI',
    badge: 'Content Credentials check'
  },
  altered: {
    state: 'altered',
    icon: '!',
    tone: 'concern',
    title: 'Credentials do not match',
    badge: 'Content Credentials check'
  },
  unproven: {
    state: 'unproven',
    icon: '?',
    tone: 'care',
    title: 'Could not confirm origin',
    badge: 'No Content Credentials found'
  },
  // Detector-based, probabilistic — never as confident as a C2PA result.
  likelyAi: {
    state: 'likely-ai',
    icon: 'AI?',
    tone: 'concern',
    title: 'Likely AI-generated',
    badge: 'AI detector estimate'
  }
};

function withCopy(base, plain, detail) {
  return { ...base, plain, detail };
}

export function verdictFromProvenance(provenance, { mediaType = 'image', screenCapture = false } = {}) {
  const noun = mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio clip' : 'image';

  if (screenCapture) {
    return withCopy(
      VERDICTS.unproven,
      `Screenshots remove Content Credentials, so we can't confirm where this ${noun} came from. Find the original file or post to check it properly.`,
      'A screen capture is a brand-new image of your screen. Any provenance the original had is gone.'
    );
  }

  const result = provenance || { status: 'unknown' };
  switch (result.status) {
    case 'valid': {
      const who = result.issuer || result.generator || 'a recognized source';
      return withCopy(
        VERDICTS.verified,
        `This ${noun} carries intact Content Credentials from ${who}. The file matches what was signed, and nothing flags it as AI-made.`,
        [result.generator && `Made with: ${result.generator}`, result.issuer && `Signed by: ${result.issuer}`, result.time && `Signed: ${result.time}`].filter(Boolean).join(' · ')
      );
    }
    case 'ai': {
      const tool = result.aiTool || result.generator;
      return withCopy(
        VERDICTS.ai,
        `The ${noun}'s own Content Credentials say it was ${tool ? `made or edited with ${tool}` : 'made or edited with AI'}. Treat it as AI content, not a real photo of an event.`,
        [tool && `AI tool: ${tool}`, result.sourceType && `Disclosed as: ${result.sourceType}`].filter(Boolean).join(' · ')
      );
    }
    case 'altered':
      return withCopy(
        VERDICTS.altered,
        `This ${noun} carries Content Credentials, but they don't match the file. That can mean it was edited or re-saved after signing. Be cautious before trusting or sharing it.`,
        result.tampering?.length ? `Validation issues: ${result.tampering.join(', ')}` : ''
      );
    case 'none':
      return withCopy(
        VERDICTS.unproven,
        `This ${noun} has no Content Credentials, so we can't confirm where it came from. That's normal for most files online — it is not proof of anything by itself. Use the steps below to check it.`,
        'Most photos and videos online carry no provenance yet. Absence of credentials is not a warning sign on its own.'
      );
    default:
      return withCopy(
        VERDICTS.unproven,
        `We couldn't run the Content Credentials check on this ${noun}. We're not able to confirm its origin, so check it using the steps below before trusting or sharing.`,
        result.error ? `Checker note: ${result.error}` : ''
      );
  }
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

// Fold a third-party detector estimate into the verdict. We only ever UPGRADE an
// "unproven" result — a cryptographic C2PA verdict (verified/ai/altered) is more
// trustworthy than any statistical model and is never overridden. The language
// stays deliberately tentative ("a computer's best guess", not "proof").
export function applyDetector(baseVerdict, detector, { mediaType = 'image' } = {}) {
  if (!detector || !detector.available) return baseVerdict;
  if (baseVerdict.state !== 'unproven') return baseVerdict;

  const noun = mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio clip' : 'image';
  const ai = typeof detector.aiProbability === 'number' ? detector.aiProbability : null;
  const deep = typeof detector.deepfakeProbability === 'number' ? detector.deepfakeProbability : null;
  const top = Math.max(ai ?? 0, deep ?? 0);
  const isDeepfake = deep != null && deep >= (ai ?? 0);

  if (top >= 0.5) {
    const strength = top >= 0.85 ? 'very likely' : 'possibly';
    const kind = isDeepfake
      ? (mediaType === 'audio'
          ? 'a fake or cloned voice'
          : `a deepfake (a fake ${noun} of a real person)`)
      : `made with AI`;
    return withCopy(
      VERDICTS.likelyAi,
      `An AI checker thinks this ${noun} is ${strength} ${kind} (about ${pct(top)} sure). This is a computer's best guess, not proof — double-check with someone you trust before believing or sharing it.`,
      [ai != null && `AI-generated estimate: ${pct(ai)}`, deep != null && `Deepfake estimate: ${pct(deep)}`].filter(Boolean).join(' · ')
    );
  }

  // Low score: keep the honest "unproven", but note the detector found nothing.
  return withCopy(
    baseVerdict,
    `${baseVerdict.plain} An AI checker also looked and found no strong signs of AI (about ${pct(top)} sure it's AI), but that is not a guarantee.`,
    [ai != null && `AI-generated estimate: ${pct(ai)}`, deep != null && `Deepfake estimate: ${pct(deep)}`].filter(Boolean).join(' · ')
  );
}

// For links and pasted text there is no file to verify, so provenance does not
// apply. We stay explicitly in "context only" mode and never imply AI detection.
export function contextOnlyVerdict(type) {
  const subject = type === 'url' ? 'page' : 'text';
  return withCopy(
    { state: 'unproven', icon: '?', tone: 'care', title: 'Context check only', badge: 'No AI detection on this type' },
    `We can't confirm whether this ${subject} involved AI. What you see below are source and sharing-pressure clues to help you decide — not an AI-detection result.`,
    ''
  );
}
