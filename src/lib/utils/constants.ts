export const APP_NAME = 'Il Mio Ricettario';

// Claude model used by every AI endpoint (PDF extraction, free-text formatting,
// category suggestion, recipe chat, nutrition estimate, section reorganization).
// Single source of truth to prevent version drift across routes.
//
// WARNING: if you bump this, also update the tech-stack references in
// README.md, CLAUDE.md, and AGENTS.md (§7 "Model"), and re-check each route's
// `thinking` config against the new model: suggest-category sends
// `{ type: 'disabled' }`, which Sonnet 5 accepts but Sonnet 5.5 and Opus 5.5
// reject with a 400 (see the comment there).
export const AI_MODEL = 'claude-sonnet-5';