import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, convertToExcalidrawElements, exportToCanvas, exportToSvg } from '@excalidraw/excalidraw';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import mermaid from 'mermaid';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import { SAMPLE, normalizeSource, isFlowchart, validateProject, stepsToMermaid } from './project';

// Mermaid subgraphs are represented as an Excalidraw group by the converter.
// Keep the subgraph boundary, but remove the group lock so every generated
// node can be selected, moved, and styled independently on the canvas.
function makeIndividuallyEditable(elements) {
  return elements.map((element) => ({ ...element, groupIds: undefined }));
}

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false } });
const STORAGE = 'flow-studio-project-v1';
let initialError = '';
let storageBlocked = false;
function readInitial() {
  try { const raw = localStorage.getItem(STORAGE); return raw ? validateProject(JSON.parse(raw)) : { version: 1, source: SAMPLE, drafts: [] }; }
  catch { storageBlocked = true; initialError = 'The saved project could not be opened. Its original data has been preserved. Download your current work as a project backup; local saving is paused.'; return { version: 1, source: SAMPLE, drafts: [] }; }
}
const initial = readInitial();
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [source, setSource] = useState(initial.source);
  const [drafts, setDrafts] = useState(initial.drafts);
  const [active, setActive] = useState(initial.drafts.at(-1)?.id || '');
  const [stage, setStage] = useState('source');
  const [preview, setPreview] = useState({ status: 'pending', source: '', svg: '' });
  const [message, setMessage] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved locally');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const api = useRef(null); const input = useRef(null); const revision = useRef(0); const renderQueue = useRef(Promise.resolve());
  const current = drafts.find(d => d.id === active);
  const sourceRef = useRef(source); sourceRef.current = source;
  const draftRef = useRef(drafts); draftRef.current = drafts;
  useEffect(() => {
    if (storageBlocked) { setSaveStatus('Local saving paused — original data preserved'); return; }
    setSaveStatus('Saving…');
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, source, drafts })); setSaveStatus('Saved locally'); }
      catch { setSaveStatus('Local save failed — download a project backup'); }
    }, 350);
    return () => clearTimeout(timer);
  }, [source, drafts]);
  useEffect(() => {
    const save = () => { if (storageBlocked) return; try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, source: sourceRef.current, drafts: draftRef.current })); } catch {} };
    window.addEventListener('pagehide', save); return () => window.removeEventListener('pagehide', save);
  }, []);
  useEffect(() => {
    const seq = ++revision.current; const code = normalizeSource(source);
    setPreview({ status: code ? 'pending' : 'empty', source, svg: '' });
    if (!code) return;
    const timer = setTimeout(() => {
      renderQueue.current = renderQueue.current.catch(() => {}).then(async () => {
        if (seq !== revision.current) return;
        try {
          if (code.length > 50000) throw new Error('Use a diagram under 50,000 characters.');
          if (!isFlowchart(code)) throw new Error('This version converts flowcharts. Start with “flowchart TD” or “flowchart LR”.');
          const { svg } = await mermaid.render(`preview-${seq}`, code);
          if (seq === revision.current) setPreview({ status: 'valid', source, svg });
        } catch (error) {
          if (seq === revision.current) setPreview({ status: 'invalid', source, svg: '', error: String(error.message || error) });
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [source]);
  async function convert() {
    if (busy || preview.status !== 'valid' || preview.source !== source) return;
    if (drafts.length >= 100) { setMessage('This project has 100 drafts. Download a backup before starting a new project.'); return; }
    const snapshot = source; setBusy(true); setMessage('');
    try {
      const result = await parseMermaidToExcalidraw(normalizeSource(snapshot));
      if (sourceRef.current !== snapshot) throw new Error('The code changed during conversion. Review the new preview and try again.');
      if (!result.elements.length || result.elements.some(el => el.type === 'image')) throw new Error('This diagram could not be converted entirely into editable shapes. Simplify it to a flowchart.');
      const elements = makeIndividuallyEditable(convertToExcalidrawElements(result.elements));
      const draft = { id: crypto.randomUUID(), name: `Draft ${drafts.length + 1}`, source: snapshot, elements, files: result.files || {}, appState: { viewBackgroundColor: '#ffffff' } };
      setDrafts(prev => [...prev, draft]); setActive(draft.id); api.current = null; setStage('canvas');
    } catch (error) { setMessage(error.message || 'Conversion failed. Check the Mermaid code.'); }
    finally { setBusy(false); }
  }
  function startDrawing() {
    if (busy) return;
    if (drafts.length >= 100) { setMessage('This project has 100 drafts. Download a backup before starting a new project.'); return; }
    const draft = { id: crypto.randomUUID(), name: `Drawing ${drafts.length + 1}`, source: '', elements: [], files: {}, appState: { viewBackgroundColor: '#ffffff' } };
    setDrafts(prev => [...prev, draft]); setActive(draft.id); api.current = null; setMessage(''); setStage('canvas');
  }
  function sceneChanged(elements, appState, files) {
    const saved = { elements, files, appState: { viewBackgroundColor: appState.viewBackgroundColor, scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom } };
    setDrafts(prev => {
      const d = prev.find(item => item.id === active);
      if (!d || JSON.stringify([d.elements, d.files, d.appState]) === JSON.stringify([saved.elements, saved.files, saved.appState])) return prev;
      return prev.map(item => item.id === active ? { ...item, ...saved } : item);
    });
  }
  async function exportImage(format) {
    const editor = api.current;
    if (!editor) return;
    const elements = editor.getSceneElements();
    if (!elements.length) { setMessage('Add a shape before exporting.'); return; }
    setBusy(true); setMessage('');
    try {
      const options = { elements, files: editor.getFiles(), appState: { ...editor.getAppState(), exportBackground: true, exportWithDarkMode: false }, exportPadding: 24 };
      if (format === 'svg') {
        const svg = await exportToSvg(options); download(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `${current.name}.svg`);
      } else {
        const canvas = await exportToCanvas({ ...options, maxWidthOrHeight: 4096 });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (!blob) throw new Error('Could not create the JPEG. Try a smaller drawing.');
        download(blob, `${current.name}.jpg`);
      }
      setMessage(`${format === 'jpg' ? 'JPEG' : 'SVG'} downloaded.`);
    } catch (error) { setMessage(error.message || 'Export failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function importProject(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a project under 20 MB.');
      const project = validateProject(JSON.parse(await file.text()));
      if (drafts.length + project.drafts.length > 100) throw new Error('Import would exceed the 100-draft limit.');
      // Merge imported drafts so existing work is never overwritten.
      const imported = project.drafts.map(d => ({ ...d, id: crypto.randomUUID(), name: `${d.name} (imported)` }));
      setDrafts(prev => [...prev, ...imported]); setSource(project.source); setStage('source');
      if (imported.length) setActive(imported.at(-1).id);
      setMessage('Project imported. Existing drafts were preserved.');
    } catch (error) { setMessage(error.message || 'Could not open this project.'); }
  }
  return <div className="studio">
    <header><div className="brand">Flow Studio<span>Mermaid to Excalidraw</span></div><div className="project-actions"><span className="save-status" role="status">{saveStatus}</span><button onClick={() => input.current.click()}>Open project</button><button onClick={() => download(new Blob([JSON.stringify({ version: 1, source, drafts }, null, 2)], { type: 'application/json' }), 'flow-studio.flow.json')}>Download project</button><input ref={input} type="file" accept=".json" hidden onChange={importProject}/></div></header>
    <nav aria-label="Diagram workspace"><button aria-pressed={stage === 'source'} className={stage === 'source' ? 'selected' : ''} onClick={() => setStage('source')}>Mermaid code</button><button aria-pressed={stage === 'canvas'} disabled={!current} className={stage === 'canvas' ? 'selected' : ''} onClick={() => setStage('canvas')}>Canvas & export</button><button disabled={busy} onClick={startDrawing}>Start drawing</button><span>Use Mermaid or start with a blank canvas.</span></nav>
    {message && <div className="notice" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>Dismiss</button></div>}
    {stage === 'source' ? <main className="source-stage">
      <div className="stage-heading"><div><h1>Shape your flow</h1><p>Edit Mermaid code below, or choose Start drawing for a blank Excalidraw canvas.</p></div><button className="primary" disabled={busy || preview.status !== 'valid' || preview.source !== source} onClick={convert}>{busy ? 'Converting…' : 'Continue to Excalidraw'}</button></div>
      <div className="workspace"><section className="code-pane"><div className="pane-heading"><h2>Mermaid code</h2><button onClick={() => setShowDescription(!showDescription)} aria-expanded={showDescription}>Start from steps</button></div>
        {showDescription && <div className="describe"><label htmlFor="description">Describe a sequence, one step per line</label><textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder={'Receive request\nReview request\nSend response'}/><p>Local generation creates a linear flow. Add decisions and branches in the code below.</p><button onClick={() => { try { setSource(stepsToMermaid(description)); setMessage('Mermaid generated from your steps. Review and refine the code.'); } catch (e) { setMessage(e.message); } }}>Generate Mermaid</button></div>}
        <label className="sr-only" htmlFor="mermaid-code">Mermaid code</label><textarea id="mermaid-code" className="code" maxLength={50000} spellCheck="false" value={source} onChange={e => setSource(e.target.value)} placeholder="Paste a Mermaid flowchart here…"/><div className="pane-footer">Flowcharts · {source.length.toLocaleString()} characters</div></section>
      <section className="preview-pane" aria-label="Diagram preview"><div className="pane-heading"><h2>Live preview</h2><span role="status">{preview.status === 'valid' && preview.source === source ? 'Ready to convert' : preview.status === 'invalid' ? 'Check the code' : preview.status === 'empty' ? 'Waiting for code' : 'Updating…'}</span></div><div className="preview-body">{preview.status === 'valid' && preview.source === source ? <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: preview.svg }}/> : preview.status === 'invalid' ? <div className="error" role="alert"><h3>Let’s fix the Mermaid code</h3><pre>{preview.error}</pre></div> : <p>{preview.status === 'empty' ? 'Paste Mermaid code to see your diagram.' : 'Preparing the preview…'}</p>}</div><div className="pane-footer">Some specialized shapes may be simplified during conversion.</div></section></div>
      <p className="footnote">Each conversion creates a new draft. Existing canvas edits stay intact.</p>
    </main> : <main className="canvas-stage"><div className="canvas-toolbar"><label>Canvas draft <select aria-label="Canvas draft" value={active} onChange={e => { api.current = null; setActive(e.target.value); }}>{drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><span>Move shapes, choose colors, and make it yours.</span><button onClick={() => api.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.8 })}>Fit drawing</button><button disabled={busy} onClick={() => exportImage('jpg')}>Download JPEG</button><button className="primary" disabled={busy} onClick={() => exportImage('svg')}>Download SVG</button></div><div className="canvas"><Excalidraw key={active} excalidrawAPI={value => { api.current = value; if (!current.appState?.zoom) requestAnimationFrame(() => value.scrollToContent(current.elements, { fitToViewport: true, viewportZoomFactor: 0.8 })); }} initialData={{ elements: current.elements, appState: current.appState, files: current.files, scrollToContent: true }} onChange={sceneChanged}/></div></main>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);


