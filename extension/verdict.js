// Shared, honest verdict mapping for the extension (classic script — content
// scripts can't load ES modules). Mirrors the web app's clairity-verdict.js:
// the only thing we state with confidence is a Content Credentials (C2PA) result.
// Everything else is "we can't confirm" — never a keyword-based AI guess.
(function (global) {
  const VERDICTS = {
    verified: { state: 'verified', icon: '✓', tone: 'ok', title: 'Verified origin' },
    ai: { state: 'ai', icon: 'AI', tone: 'concern', title: 'Made or edited with AI' },
    altered: { state: 'altered', icon: '!', tone: 'concern', title: 'Credentials do not match' },
    unproven: { state: 'unproven', icon: '?', tone: 'care', title: 'Could not confirm origin' }
  };

  function fromProvenance(provenance, options) {
    const opts = options || {};
    const noun = opts.isVideo ? 'video' : 'image';
    const result = provenance || { status: 'unknown' };

    switch (result.status) {
      case 'valid': {
        const who = result.issuer || result.generator || 'a recognized source';
        return Object.assign({}, VERDICTS.verified, {
          plain: `This ${noun} carries intact Content Credentials from ${who}, and nothing flags it as AI-made.`
        });
      }
      case 'ai': {
        const tool = result.aiTool || result.generator;
        return Object.assign({}, VERDICTS.ai, {
          plain: `This ${noun}'s own Content Credentials say it was ${tool ? 'made or edited with ' + tool : 'made or edited with AI'}. Treat it as AI content.`
        });
      }
      case 'altered':
        return Object.assign({}, VERDICTS.altered, {
          plain: `This ${noun} has Content Credentials that don't match the file. It may have been changed after signing. Be careful before trusting or sharing it.`
        });
      case 'none':
        return Object.assign({}, VERDICTS.unproven, {
          plain: `This ${noun} has no Content Credentials, so we can't confirm where it came from. That's normal online and is not proof of anything by itself.`
        });
      default:
        return Object.assign({}, VERDICTS.unproven, {
          plain: `We couldn't run the Content Credentials check on this ${noun}. Pause and check it another way before trusting or sharing it.`
        });
    }
  }

  global.VeraxVerdict = { VERDICTS: VERDICTS, fromProvenance: fromProvenance };
})(self);
