export const APP_NAME = 'Il Mio Ricettario';

// Claude model used by every AI endpoint (PDF extraction, free-text formatting,
// category suggestion, recipe chat). Single source of truth to prevent version
// drift across routes.
//
// WARNING: if you bump this, also update the tech-stack references in
// README.md, CLAUDE.md, and AGENTS.md (§7 "Model").
export const AI_MODEL = 'claude-sonnet-5';