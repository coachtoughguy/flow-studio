export const SAMPLE = `flowchart TD
  A[Receive request] --> B{Everything ready?}
  B -->|Yes| C[Create diagram]
  B -->|No| D[Gather details]
  D --> B
  C --> E[Review and share]`;

export function normalizeSource(source) {
  return source.trim()
    .replace(/^```[^\n]*\n/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}

export function isFlowchart(source) {
  return /^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/m.test(normalizeSource(source));
}

export function validateProject(value) {
  if (!value || value.version !== 1 || typeof value.source !== 'string' || !Array.isArray(value.drafts)) throw new Error('Choose a Flow Studio project file.');
  if (value.source.length > 50000 || value.drafts.length > 100) throw new Error('This project exceeds the prototype limits.');
  const ids = new Set();
  const types = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'arrow', 'line', 'freedraw', 'image', 'frame', 'magicframe', 'embeddable', 'iframe']);
  for (const draft of value.drafts) {
    if (!draft || typeof draft.id !== 'string' || ids.has(draft.id) || typeof draft.name !== 'string' || typeof draft.source !== 'string' || !Array.isArray(draft.elements) || !draft.files || typeof draft.files !== 'object') throw new Error('The project contains an invalid draft.');
    if (draft.elements.some(el => !el || typeof el.id !== 'string' || typeof el.type !== 'string' || !Number.isFinite(el.x) || !Number.isFinite(el.y))) throw new Error('The project contains invalid drawing elements.');
    for (const el of draft.elements) {
      if (!types.has(el.type) || (el.groupIds !== undefined && !Array.isArray(el.groupIds)) || ['width', 'height', 'angle', 'strokeWidth', 'opacity'].some(key => el[key] !== undefined && !Number.isFinite(el[key]))) throw new Error('The project contains invalid shape properties.');
      if (el.width < 0 || el.height < 0) throw new Error('The project contains negative shape dimensions.');
    }
    for (const file of Object.values(draft.files)) {
      if (!file || typeof file.id !== 'string' || typeof file.dataURL !== 'string' || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(file.dataURL)) throw new Error('The project contains an invalid embedded image.');
    }
    if (draft.appState !== undefined && (draft.appState === null || typeof draft.appState !== 'object' || Array.isArray(draft.appState))) throw new Error('The project contains invalid canvas settings.');
    if (draft.appState?.zoom && (!Number.isFinite(draft.appState.zoom.value) || draft.appState.zoom.value <= 0)) throw new Error('The project contains invalid canvas zoom.');
    ids.add(draft.id);
  }
  return value;
}

// Deterministic local fallback. It intentionally handles ordered steps, not arbitrary prose.
export function stepsToMermaid(text) {
  const steps = text.split(/\n|\s+then\s+|\s*→\s*/i).map(s => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (steps.length < 2) throw new Error('Enter at least two steps, one per line or separated by “then”.');
  if (steps.length > 30) throw new Error('Use up to 30 steps for local generation.');
  const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]/g, ' ');
  return 'flowchart TD\n' + steps.map((s, i) => `  N${i}["${escape(s)}"]`).join('\n') + '\n' + steps.slice(1).map((_, i) => `  N${i} --> N${i + 1}`).join('\n');
}
