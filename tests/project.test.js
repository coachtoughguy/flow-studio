import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSource, isFlowchart, validateProject, stepsToMermaid } from '../src/project.js';
test('accept pasted code fences and flow directions', () => { assert.equal(normalizeSource('flowchart TD\n```css\nsubgraph Group\nend\n```'), 'flowchart TD\nsubgraph Group\nend'); assert.ok(isFlowchart('%% comment\nflowchart TD\n A-->B')); assert.equal(isFlowchart('sequenceDiagram\n A->>B: hi'), false); });
test('reject malformed backups and duplicate draft IDs', () => { assert.throws(() => validateProject({})); const d = {id:'1',name:'Draft',source:'',elements:[],files:{}}; assert.throws(() => validateProject({version:1,source:'',drafts:[d,d]})); assert.throws(() => validateProject({version:1,source:'',drafts:[{...d,elements:[{id:'x',type:'rectangle',x:'bad',y:0}]}]})); });
test('project round trip preserves manual positions and source', () => { const project = {version:1,source:'flowchart TD\n A-->B',drafts:[{id:'1',name:'Draft',source:'flowchart TD\n A-->B',elements:[{id:'a',type:'rectangle',x:275,y:110,backgroundColor:'#a5d8ff'}],files:{}}]}; assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project); });
test('local language generation escapes labels and requires a sequence', () => { assert.throws(() => stepsToMermaid('One step')); const result = stepsToMermaid('Receive "request"\nReview <details>\nSend response'); assert.match(result,/&quot;/); assert.match(result,/&lt;details&gt;/); assert.match(result,/N1 --> N2/); });
test('blank drawing and Mermaid drafts coexist in a project backup', () => {
  const project = { version: 1, source: 'unfinished Mermaid', drafts: [
    { id: 'mermaid', name: 'Draft 1', source: 'flowchart TD\n A-->B', elements: [], files: {} },
    { id: 'drawing', name: 'Drawing 2', source: '', elements: [], files: {}, appState: { viewBackgroundColor: '#ffffff' } },
  ] };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
  project.drafts[1].elements.push({ id: 'shape', type: 'rectangle', x: 50, y: 80, width: 100, height: 60 });
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
  assert.equal(project.drafts[0].source, 'flowchart TD\n A-->B');
});
