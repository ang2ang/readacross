const test = require('node:test');
const assert = require('node:assert/strict');
const loadSource = require('./load-source.cjs');
const policy = loadSource()('../src/reading/policy.ts');
const { DAY, FILE_TTL, STORAGE_BUDGET, retentionPlan, documentBytes, translationKey, digest, clampPanelWidth } = policy;
const now = 2_000_000_000_000;
function document(id, overrides = {}) {
  return { id, name: `${id}.pdf`, type: 'pdf', lastOpenedAt: now, position: {type:'pdf',page:2}, fontSize:100,
    translationScroll:0, fileBytes:1024, translationBytes:100, translationCount:1, ...overrides };
}
const settings = {provider:'local',model:'test',targetLanguage:'zh',promptStyle:'General',temperature:1,systemPrompt:'Translate',endpointHash:'local'};

test('file identity is byte-based, independent of filename', async () => {
  const a = new File(['same content'], 'a.pdf');
  const renamed = new File(['same content'], 'b.pdf');
  const changed = new File(['different content'], 'a.pdf');
  assert.equal(await digest(await a.arrayBuffer()), await digest(await renamed.arrayBuffer()));
  assert.notEqual(await digest(await a.arrayBuffer()), await digest(await changed.arrayBuffer()));
});
test('cache requires document, scope, source, location and actual settings', async () => {
  const key = (doc='a', scope='page', text='source', locator={type:'pdf',page:1}, config=settings) => translationKey(doc,scope,text,locator,config);
  const original = await key();
  assert.equal(original, await key('a','page',' source  ',{type:'pdf',page:1,y:.7}));
  for (const variant of [key('b'),key('a','selection'),key('a','page','changed'),key('a','page','source',{type:'pdf',page:2}),
    ...Object.keys(settings).map(field => key('a','page','source',undefined,{...settings,[field]: `${settings[field]}-changed`}))]) {
    assert.notEqual(original, await variant);
  }
  assert.notEqual(await key('a','page','source',{type:'epub',cfi:'start',endCfi:'end'}), await key('a','page','source',{type:'epub',cfi:'start',endCfi:'other'}));
});
test('exactly 10 days is retained; older copies expire, translations and active original survive', () => {
  const input = [document('at',{lastOpenedAt:now-FILE_TTL}),document('over',{lastOpenedAt:now-FILE_TTL-1}),document('active',{lastOpenedAt:now-20*DAY})];
  const result=retentionPlan(input,'active',now);
  assert.deepEqual(result.removed,['over']);
  assert.equal(result.records[1].translationBytes,100);
  assert.deepEqual(result.records[1].position,{type:'pdf',page:2});
  assert.equal(input[1].fileBytes,1024, 'proposal must not mutate input');
});
test('5 copies retained; sixth evicts least recently opened copy', () => {
  const records=Array.from({length:6},(_,i)=>document(String(i),{lastOpenedAt:now-i}));
  assert.equal(retentionPlan(records.slice(0,5),null,now).removed.length,0);
  assert.deepEqual(retentionPlan(records,'5',now).removed,['4']);
});
test('100MB exact boundary, over budget, protected file, and impossible translation-only budget', () => {
  const records=[document('a')];
  const size=documentBytes(records[0]);
  assert.equal(retentionPlan(records,null,now,size).fits,true);
  assert.equal(retentionPlan(records,null,now,size-1).records[0].fileBytes,0);
  assert.equal(retentionPlan(records,'a',now,size-1).fits,false);
  const huge=document('huge',{fileBytes:STORAGE_BUDGET+1});
  assert.equal(retentionPlan([huge],null,now).records[0].fileBytes,0);
  assert.equal(retentionPlan([document('text',{fileBytes:0,translationBytes:STORAGE_BUDGET})],null,now).fits,false);
});
test('sidebar constraints reserve at least 480px for the original', () => {
  assert.equal(clampPanelWidth(384,1280),384);
  assert.equal(clampPanelWidth(900,1280),640);
  assert.equal(clampPanelWidth(640,1024),544);
  assert.equal(clampPanelWidth(1,1280),320);
});

const { pdfPageWidth, pdfCenterAnchor, pdfCenterScroll } = loadSource()('../src/reading/pdf-layout.ts');
const { pdfNamedLinkPage } = loadSource()('../src/reading/pdf-links.ts');
const linkDocument = overrides => ({numPages:100,getDestination:async()=>null,getPageLabels:async()=>null,
  getPageIndex:async()=>0,...overrides});
test('PDF named links prefer explicit destinations and resolve zero-based page references', async () => {
  const pdf=linkDocument({getDestination:async()=>[7,{name:'Fit'}],getPageLabels:async()=>{throw Error('must not use label fallback')}});
  assert.equal(await pdfNamedLinkPage(pdf,'page58'),8);
  const ref={num:123,gen:0};let received;
  assert.equal(await pdfNamedLinkPage(linkDocument({getDestination:async()=>[ref,{name:'XYZ'}],getPageIndex:async value=>{received=value;return 79}}),'chapter'),80);
  assert.deepEqual(received,ref);
});
test('PDF missing page-label aliases include front matter instead of guessing a page offset', async () => {
  const labels=[...Array.from({length:22},(_,i)=>'front-'+i),...Array.from({length:78},(_,i)=>String(i+1))];
  const pdf=linkDocument({getPageLabels:async()=>labels});
  assert.equal(await pdfNamedLinkPage(pdf,'page58'),80);
  assert.equal(await pdfNamedLinkPage(linkDocument({numPages:3,getPageLabels:async()=>['i','ii','1']}),'pageii'),2);
  assert.equal(await pdfNamedLinkPage(linkDocument(),'page58'),null);
});
test('PDF ambiguous or unknown labels do not navigate to a guessed target', async () => {
  const pdf=linkDocument({getPageLabels:async()=>['1','2','2']});
  for(const name of ['page2','page58','missing-chapter','58'])assert.equal(await pdfNamedLinkPage(pdf,name),null);
});
test('PDF invalid explicit targets do not fall through to unrelated page labels', async () => {
  for(const target of [-1,100,1.5,'2',null,{num:'1',gen:0}]) {
    const pdf=linkDocument({getDestination:async()=>[target,{name:'Fit'}],getPageLabels:async()=>['58']});
    assert.equal(await pdfNamedLinkPage(pdf,'page58'),null);
  }
});
test('manual PDF zoom keeps the previous 800px baseline across sidebar widths', () => {
  for (const available of [342, 592, 848, 1232]) assert.equal(pdfPageWidth(available,130,false),1040);
  assert.equal(pdfPageWidth(848,130,true),848);
  assert.equal(pdfPageWidth(592,130,true),592);
  assert.equal(pdfPageWidth(848,140,false)/pdfPageWidth(848,100,false),1.4);
});
test('PDF zoom and sidebar resize preserve the content at the viewport center', () => {
  const before = {width:800,height:1100,viewportWidth:700,viewportHeight:600,left:60,top:350};
  const x=pdfCenterAnchor(0,before.viewportWidth,24-before.left,before.width);
  const y=pdfCenterAnchor(0,before.viewportHeight,24-before.top,before.height);
  const left=pdfCenterScroll(x,1040,560), top=pdfCenterScroll(y,1430,600);
  assert.ok(Math.abs(pdfCenterAnchor(0,560,24-left,1040)-x)<1e-10);
  assert.ok(Math.abs(pdfCenterAnchor(0,600,24-top,1430)-y)<1e-10);
  assert.equal(pdfCenterScroll(.5,400,800),0,'a page that fits stays centered without phantom scrolling');
  assert.equal(pdfCenterScroll(1,1040,560),528,'page edges clamp to the available scroll range');
  assert.equal(pdfCenterAnchor(0,800,24,470,y),y,'a fully visible page retains its reading anchor across narrow-screen round trips');
});

function storeWith(storage) {
  // Each test gets an isolated module and uses the real Zustand state transitions.
  return loadSource({'../reading/storage':{readingStorage:storage}})('../src/store/useReadingStore.ts').useReadingStore;
}
function fakeStorage(overrides={}) {
  return { load:async()=>({document:undefined,translations:[]}), open:async record=>({...record,fileBytes:10}),
    maintain:async()=>0,recent:async()=>[],update:async()=>{},remove:async()=>{},saveTranslation:async record=>record,...overrides };
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
test('PDF fit mode and manual zoom restore independently, including legacy records', async () => {
  for (const [saved,expected] of [[{fontSize:130},false],[{fontSize:100},true],
    [{fontSize:100,pdfFitWidth:false},false],[{fontSize:130,pdfFitWidth:true},true]]) {
    const store=storeWith(fakeStorage({load:async()=>({document:document('a',saved),translations:[]})}));
    await store.getState().open(new File(['a'],'a.pdf'));
    assert.equal(store.getState().pdfFitWidth,expected);
    store.getState().setFontSize(140);
    assert.equal(store.getState().document.pdfFitWidth,false);
    store.getState().fitPdfWidth();
    assert.equal(store.getState().fontSize,140,'fitting does not reinterpret the saved manual zoom');
    assert.equal(store.getState().document.pdfFitWidth,true);
    store.getState().close();
  }
});
test('late document restore cannot replace a newly opened file', async () => {
  const first=deferred(); const second=deferred(); let calls=0;
  const store=storeWith(fakeStorage({load:()=>++calls===1?first.promise:second.promise}));
  const opening=store.getState().open(new File(['a'],'a.pdf'));
  while(!calls) await new Promise(r=>setImmediate(r));
  const newer=store.getState().open(new File(['b'],'b.pdf'));
  while(calls<2) await new Promise(r=>setImmediate(r));
  second.resolve({document:undefined,translations:[]}); await newer;
  first.resolve({document:document('wrong'),translations:[{id:'old'}]}); await opening;
  assert.equal(store.getState().document.name,'b.pdf'); assert.deepEqual(store.getState().entries,[]);
});
test('database unavailable keeps the current file readable and marks it unsaved', async () => {
  const store=storeWith(fakeStorage({load:async()=>{throw new Error('unavailable')}}));
  await store.getState().open(new File(['a'],'a.pdf'));
  assert.equal(store.getState().ready,true);assert.equal(store.getState().status,'unsaved');assert.equal(store.getState().document.name,'a.pdf');
});
test('deleted records cannot be repopulated by old callbacks', async () => {
  let writes=0;const store=storeWith(fakeStorage({saveTranslation:async record=>{writes++;return record}}));
  await store.getState().open(new File(['a'],'a.pdf'));
  const oldRevision=store.getState().revision;
  await store.getState().remove();
  await store.getState().addEntry({id:'late'},oldRevision);
  assert.equal(writes,0);assert.deepEqual(store.getState().entries,[]);
});
test('temporary source jumps preserve the original resume checkpoint', async () => {
  const store=storeWith(fakeStorage()); await store.getState().open(new File(['a'],'a.pdf'));
  const original={type:'pdf',page:8,y:.4}; const jumps=[];
  store.getState().setBridge({getLocation:()=>original,navigate:async location=>{jumps.push(location)},readSource:async()=>{},highlight:()=>{}});
  await store.getState().locate({type:'pdf',page:2}); await store.getState().locate({type:'pdf',page:3});
  store.getState().reportPosition({type:'pdf',page:3});
  assert.deepEqual(store.getState().document.position,original);
  await store.getState().goBack();assert.deepEqual(jumps.at(-1),original);assert.equal(store.getState().returnLocation,null);
  store.getState().close();
});

test('failed translation commit retains readable output and reports unsaved', async () => {
  const store=storeWith(fakeStorage({saveTranslation:async()=>{throw new Error('write failed')}}));
  await store.getState().open(new File(['a'],'a.pdf'));
  await store.getState().addEntry({id:'complete',translation:'completed result'},store.getState().revision);
  assert.equal(store.getState().status,'unsaved');assert.equal(store.getState().entries[0].translation,'completed result');
});
test('late completed save cannot restore entries after clearing', async () => {
  const pending=deferred();const store=storeWith(fakeStorage({saveTranslation:()=>pending.promise}));
  await store.getState().open(new File(['a'],'a.pdf'));
  const saving=store.getState().addEntry({id:'complete'},store.getState().revision);
  const doc=store.getState().document;await store.getState().remove();pending.resolve(doc);await saving;
  assert.deepEqual(store.getState().entries,[]);assert.equal(store.getState().status,'unsaved');
});
const {buildReadingMarkdown}=loadSource()('../src/reading/markdown.ts');
const exportEntry=(id,overrides={})=>({id,documentId:'doc',originalText:'RAW SOURCE MUST NOT APPEAR',translation:'Translated '+id,
  createdAt:'2026-10-21T01:00:00.000Z',scope:'page',locator:{type:'pdf',page:3},settings,...overrides});
test('real exported Markdown contains each complete translation once, in source order', () => {
  const first=exportEntry('first',{locator:{type:'pdf',page:2},translation:'全文译文'.repeat(1000)});
  const second=exportEntry('second',{locator:{type:'pdf',page:10}});
  const input=[second,first];const {markdown,fileName}=buildReadingMarkdown('book.pdf','PDF',input,'doc');
  for(const record of input)assert.equal(markdown.split(record.translation).length-1,1);
  assert.ok(markdown.indexOf(first.translation)<markdown.indexOf(second.translation));
  assert.ok(markdown.indexOf('## Translation details')>markdown.indexOf(second.translation));
  for(const unwanted of ['RAW SOURCE MUST NOT APPEAR','System prompt used:','Original Snapshot','Translation Entries','Backlinks','[[ReadAcross]]','readacross_id:'])assert.ok(!markdown.includes(unwanted));
  assert.ok(markdown.startsWith('# book\n'));assert.ok(markdown.includes('2 completed translations'));
  assert.equal(fileName,'book.translated.md');assert.deepEqual(input.map(record=>record.id),['second','first']);
});
test('export metadata uses each saved configuration and excludes other documents', () => {
  const first=exportEntry('a',{settings:{...settings,model:'saved-model-a',temperature:.7,systemPrompt:'PRIVATE PROMPT A'}});
  const second=exportEntry('b',{scope:'selection',settings:{...settings,model:'saved-model-b',targetLanguage:'ja',temperature:1.2,systemPrompt:'PRIVATE PROMPT B'}});
  const {markdown}=buildReadingMarkdown('book.pdf','PDF',[first,second,exportEntry('foreign',{documentId:'other'}),exportEntry('empty',{translation:'  '})],'doc');
  for(const expected of ['local / saved-model-a','local / saved-model-b','Temperature 0.7','Temperature 1.2','ja','Selection','Configuration 1','Configuration 2',first.createdAt])assert.ok(markdown.includes(expected));
  for(const unwanted of ['PRIVATE PROMPT','Translated foreign','Translated empty'])assert.ok(!markdown.includes(unwanted));
  assert.ok(markdown.includes('2 completed translations'));
  const promptsOnly=buildReadingMarkdown('book.pdf','PDF',[first,{...second,settings:{...first.settings,systemPrompt:'ANOTHER PRIVATE PROMPT'}}],'doc').markdown;
  assert.ok(promptsOnly.includes('Configuration 2'));assert.ok(!promptsOnly.includes('ANOTHER PRIVATE PROMPT'));
});
test('export preserves Markdown indentation, headings, lists, tables and hard line breaks', () => {
  const translation='    indented code\n\n### Heading\n\n- first\n  - nested\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst a = 1;\n```\n\nline one  \nline two';
  const {markdown}=buildReadingMarkdown('Pasted Text','Text',[exportEntry('format',{locator:undefined,translation})]);
  assert.ok(markdown.includes('\n\n'+translation+'\n\n'));
  assert.equal(markdown.split(translation).length-1,1);
});
test('EPUB exports retain complete CFI ranges in details without filling the reading body', () => {
  const locator={type:'epub',section:1,cfi:'epubcfi(/6/4[chapter]!/4/2/1:0)',endCfi:'epubcfi(/6/4[chapter]!/4/6/1:20)'};
  const {markdown,fileName}=buildReadingMarkdown('book.epub','EPUB',[exportEntry('epub',{locator})],'doc');
  assert.ok(markdown.includes('## EPUB · Section 2 · Current view'));
  assert.ok(markdown.indexOf('CFI:')>markdown.indexOf('## Translation details'));
  assert.ok(markdown.includes('epubcfi(/6/4\\[chapter\\]!/4/2/1:0)'));
  assert.ok(markdown.includes(' → epubcfi(/6/4\\[chapter\\]!/4/6/1:20)'));
  assert.equal(fileName,'book.translated.md');
});
test('empty export is rejected and download names have a usable Markdown extension', () => {
  assert.throws(()=>buildReadingMarkdown('book.pdf','PDF',[],'doc'),/No completed/);
  assert.throws(()=>buildReadingMarkdown('book.pdf','PDF',[exportEntry('other',{documentId:'other'})],'doc'),/No completed/);
  const result=buildReadingMarkdown('Draft: [paper]?*.pdf','PDF',[exportEntry('safe')],'doc');
  assert.ok(!/[\\/:*?"<>|]/.test(result.fileName));assert.ok(result.fileName.endsWith('.translated.md'));
});
test('a late return-to-reading completion cannot write a position into a different file', async () => {
  const returning=deferred();const store=storeWith(fakeStorage());await store.getState().open(new File(['a'],'a.pdf'));
  store.getState().setBridge({getLocation:()=>({type:'pdf',page:9}),navigate:async()=>{},highlight:()=>{},readSource:async()=>{}});
  await store.getState().locate({type:'pdf',page:2});store.getState().setBridge({...store.getState().bridge,navigate:()=>returning.promise});
  const back=store.getState().goBack();await store.getState().open(new File(['b'],'b.pdf'));returning.resolve();await back;
  assert.equal(store.getState().document.name,'b.pdf');assert.equal(store.getState().document.position,null);
});
test('completed records are exported in numeric source order', () => {
  const record=(id,locator)=>({id,locator,createdAt:'2026-01-01'});
  const pdf=[record('later',{type:'pdf',page:10}),record('earlier',{type:'pdf',page:2})];
  assert.deepEqual(pdf.sort(policy.compareRecords).map(r=>r.id),['earlier','later']);
  const epub=[record('later',{type:'epub',cfi:'epubcfi(/6/10!/4/2/1:0)'}),record('earlier',{type:'epub',cfi:'epubcfi(/6/2!/4/2/1:0)'})];
  assert.deepEqual(epub.sort(policy.compareRecords).map(r=>r.id),['earlier','later']);
});

test('failed removal keeps complete translations and reading state available', async () => {
  const store=storeWith(fakeStorage({remove:async()=>{throw new Error('delete failed')}}));
  await store.getState().open(new File(['a'],'a.pdf'));
  await store.getState().addEntry({id:'complete',translation:'keep me'},store.getState().revision);
  await assert.rejects(store.getState().remove(),/delete failed/);
  assert.equal(store.getState().entries[0].translation,'keep me');assert.equal(store.getState().ready,true);
  assert.notEqual(store.getState().error,'Local records cleared.');
});
test('late removal completion cannot clear a newly opened document', async () => {
  const deletion=deferred();const store=storeWith(fakeStorage({remove:()=>deletion.promise}));
  await store.getState().open(new File(['a'],'a.pdf'));
  const removing=store.getState().remove();await store.getState().open(new File(['b'],'b.pdf'));
  await store.getState().addEntry({id:'b-entry'},store.getState().revision);
  deletion.resolve('new-version');await removing;
  assert.equal(store.getState().document.name,'b.pdf');assert.equal(store.getState().entries[0].id,'b-entry');
  assert.equal(store.getState().error,null);
});
test('restored reader becomes usable before original copy commits and retains subsequent navigation', async () => {
  const copy=deferred();let original;const store=storeWith(fakeStorage({open:record=>{original=record;return copy.promise}}));
  const opening=store.getState().open(new File(['a'],'a.pdf'));
  while(!original)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.getState().ready,true);
  store.getState().reportPosition({type:'pdf',page:5,y:.3});store.getState().setFontSize(130);
  copy.resolve({...original,fileBytes:10});await opening;
  assert.equal(store.getState().document.position.page,5);assert.equal(store.getState().fontSize,130);
  assert.equal(store.getState().document.pdfFitWidth,false);
  store.getState().close();
});
test('clearing during document lookup does not re-save the original or strand the reader', async () => {
  const lookup=deferred();let loading=false;let copies=0;
  const store=storeWith(fakeStorage({load:()=>{loading=true;return lookup.promise},open:async record=>{copies++;return record},remove:async()=>'/cleared'}));
  const opening=store.getState().open(new File(['a'],'a.pdf'));
  while(!loading)await new Promise(resolve=>setImmediate(resolve));
  await store.getState().remove();lookup.resolve({document:undefined,translations:[],version:'/cleared'});await opening;
  assert.equal(copies,0);assert.equal(store.getState().ready,true);assert.equal(store.getState().status,'unsaved');
  assert.equal(store.getState().document.storageVersion,'/cleared');
});
test('a later successful save cannot hide an earlier unsaved complete translation', async () => {
  let attempts=0;const store=storeWith(fakeStorage({saveTranslation:async record=>{
    if(++attempts===1)throw new Error('full');return {...record,translationCount:attempts-1};
  }}));
  await store.getState().open(new File(['a'],'a.pdf'));
  const revision=store.getState().revision;
  await store.getState().addEntry({id:'first'},revision);await store.getState().addEntry({id:'second'},revision);
  assert.equal(store.getState().status,'unsaved');assert.deepEqual(store.getState().unsavedEntries,['first']);
  await store.getState().addEntry({id:'first'},revision);
  assert.equal(store.getState().status,'saved');assert.deepEqual(store.getState().unsavedEntries,[]);
});
test('range fallback is visible and does not overwrite a storage error', async () => {
  const store=storeWith(fakeStorage());await store.getState().open(new File(['a'],'a.pdf'));
  store.setState({error:'storage unavailable'});
  store.getState().setBridge({getLocation:()=>({type:'pdf',page:3}),navigate:async()=> 'range',readSource:async()=>{},highlight:()=>{}});
  await store.getState().locate({type:'pdf',page:1,quote:'unavailable'});
  assert.ok(store.getState().locationNotice.includes('Exact selection unavailable'));
  assert.equal(store.getState().error,'storage unavailable');
  store.getState().userNavigated();assert.equal(store.getState().locationNotice,null);store.getState().close();
});
