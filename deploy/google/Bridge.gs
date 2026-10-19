// Separate Apps Script project; include the app's current planner as Core.gs. No timer.
var TEAM_TRIAL={document_id:'1dCOOm4LIpuF49lcIxgcJcDuSgeHV9d4IAJ6GpjI6q80',tab_id:'t.rf2v4q59t7sc',tab_title:'DP1 THESIS (FINAL)'};
var TEAM_INBOX='1Vlx6tp0oQHfuHxAgo7Pl6JyMH3pfrlpN';
var TEAM_BACKUPS='1l5dhhIfh3SWs3lUQHQguPvrKZOChUJhX';
// Run once in the editor to authorize/read-check this separate bridge; no writes or timers.
function checkTeamBridge(){
  var doc=Solair.normalize(teamRead_()),tab=doc.tabs.find(function(t){return t.tabId===TEAM_TRIAL.tab_id&&t.title===TEAM_TRIAL.tab_title;});
  if(doc.documentId!==TEAM_TRIAL.document_id||!tab)throw new Error('Trial identity changed');
  Solair.protectedSection(Solair.paragraphs(tab));
  DriveApp.getFolderById(TEAM_INBOX).getName();DriveApp.getFolderById(TEAM_BACKUPS).getName();
  console.log('Trial, protected SOP boundaries, inbox and backup folder are readable. No manuscript update or timer was created.');
}
function doPost(e){
  var lock,locked=false;
  try{
    var body=JSON.parse(e.postData.contents),props=PropertiesService.getScriptProperties(),key=props.getProperty('SOLAIR_BRIDGE_KEY');
    if(!key||key.length<32||typeof body.timestamp!=='number'||Math.abs(Date.now()-body.timestamp)>120000||!/^[a-f0-9]{48}$/.test(body.nonce||'')||typeof body.payload!=='string'||body.payload.length>250000)throw new Error('Rejected');
    var signature=Utilities.computeHmacSha256Signature(body.timestamp+'.'+body.nonce+'.'+body.payload,key,Utilities.Charset.UTF_8).map(function(v){return('0'+((v+256)%256).toString(16)).slice(-2);}).join('');
    var supplied=String(body.signature||''),diff=signature.length^supplied.length;
    for(var i=0;i<signature.length;i++)diff|=signature.charCodeAt(i)^(supplied.charCodeAt(i)||0);
    if(diff)throw new Error('Rejected');
    lock=LockService.getScriptLock();lock.waitLock(20000);locked=true;
    var nonces=JSON.parse(props.getProperty('SOLAIR_BRIDGE_NONCES')||'{}'),time=Date.now();
    Object.keys(nonces).forEach(function(n){if(nonces[n]<time-240000)delete nonces[n];});
    if(nonces[body.nonce]||Object.keys(nonces).length>=100)throw new Error('Rejected');
    nonces[body.nonce]=time;props.setProperty('SOLAIR_BRIDGE_NONCES',JSON.stringify(nonces));
    var request=JSON.parse(body.payload);
    if(request.action!=='apply'&&request.action!=='backup'){lock.releaseLock();locked=false;}
    return teamJson_({ok:true,data:teamDispatch_(request.action,request.args||{})});
  }catch(_){return teamJson_({ok:false,error:'Scoped bridge request rejected.'});}
  finally{if(locked)lock.releaseLock();}
}
function teamJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function teamRead_(){return Docs.Documents.get(TEAM_TRIAL.document_id,{includeTabsContent:true});}
function teamDispatch_(action,args){
  if(action==='get')return teamRead_();
  if(action==='backup'){
    if(typeof args.title!=='string'||args.title.length>200||!/^SOLAIR app trial backup /.test(args.title))throw new Error('Rejected');
    var copy=DriveApp.getFileById(TEAM_TRIAL.document_id).makeCopy(args.title,DriveApp.getFolderById(TEAM_BACKUPS));return{id:copy.getId()};
  }
  if(action==='apply'){
    var job=args.job;
    if(!job||!Array.isArray(job.operations)||job.operations.some(function(op){return['replace_text','format_paragraph','insert_figure','replace_figure'].indexOf(op.type)<0;}))throw new Error('Rejected');
    job.operations.forEach(function(op){if(op.type==='insert_figure'||op.type==='replace_figure'){
      var origin=PropertiesService.getScriptProperties().getProperty('SOLAIR_ASSET_ORIGIN');
      if(job.operations.length!==1||!origin||!/^https:\/\/[^\/?#]+$/.test(origin)||!String(op.uri).startsWith(origin+'/api/v1/private-transfer/')||!/^[a-f0-9]{64}$/.test(String(op.uri).slice((origin+'/api/v1/private-transfer/').length)))throw new Error('Private transfer rejected');
    }});
    var raw=teamRead_(),doc=Solair.normalize(raw);
    if(!args.revision||doc.revisionId!==args.revision)throw new Error('Stale revision');
    var plan=Solair.plan(raw,job,TEAM_TRIAL);
    if(plan.status==='already_applied')return{alreadyApplied:true};
    if(plan.status!=='ready')throw new Error('Rejected');
    // Recompute guarded requests here; never accept an arbitrary batch from HTTP.
    return Docs.Documents.batchUpdate({requests:plan.requests,writeControl:{requiredRevisionId:args.revision}},TEAM_TRIAL.document_id);
  }
  if(action==='inbox'){
    var files=DriveApp.getFolderById(TEAM_INBOX).getFiles(),items=[];
    while(files.hasNext()&&items.length<100){var f=files.next();if(!f.isTrashed())items.push({id:f.getId(),name:f.getName(),mimeType:f.getMimeType()});}
    return{files:items,next_page_token:files.hasNext()?'more':''};
  }
  if(action==='source'){
    if(!/^[\w-]+$/.test(args.id||''))throw new Error('Rejected');
    var file=DriveApp.getFileById(args.id),parents=file.getParents(),inInbox=false;
    while(parents.hasNext())if(parents.next().getId()===TEAM_INBOX)inInbox=true;
    if(!inInbox||file.isTrashed())throw new Error('Rejected');
    if(args.nativeDocument&&file.getMimeType()!=='application/vnd.google-apps.document')throw new Error('Native source required');
    if(/^image\/(png|jpeg)$/.test(file.getMimeType())){
      if(file.getSize()>20*1024*1024)throw new Error('Image too large');return{base64:Utilities.base64Encode(file.getBlob().getBytes())};
    }
    if(file.getMimeType()==='application/vnd.google-apps.document')return Docs.Documents.get(args.id,{includeTabsContent:true});
    if(!/^(text\/|application\/json)/.test(file.getMimeType())&&!/\.(txt|md|csv|json)$/i.test(file.getName()))throw new Error('Text extraction required');
    if(file.getSize()>20*1024*1024)throw new Error('Source too large');
    var text=file.getBlob().getDataAsString('UTF-8');if(text.length>200000)throw new Error('Extract a smaller source section');return{text:text,modifiedTime:file.getLastUpdated().toISOString()};
  }
  if(action==='pdf'){
    return teamPdf_();
  }
  throw new Error('Unsupported action');
}
// Drive files.download supports manuscripts larger than files.export's 10 MB limit.
function teamPdf_(){
  var headers={Authorization:'Bearer '+ScriptApp.getOAuthToken()},base='https://www.googleapis.com/drive/v3/';
  function api(path,method){
    var response=UrlFetchApp.fetch(base+path,{method:method||'get',headers:headers,muteHttpExceptions:true});
    if(response.getResponseCode()!==200)throw new Error('PDF operation failed');return JSON.parse(response.getContentText());
  }
  var operation=api('files/'+TEAM_TRIAL.document_id+'/download?mimeType=application%2Fpdf','post');
  for(var i=0;!operation.done&&i<5;i++){
    var name=String(operation.name||'');if(!/^operations\/[A-Za-z0-9_-]+$/.test(name))throw new Error('Invalid operation');
    if(operation.metadata&&operation.metadata.resourceKey)headers['X-Goog-Drive-Resource-Keys']=TEAM_TRIAL.document_id+'/'+operation.metadata.resourceKey;
    Utilities.sleep(Math.min(1000*Math.pow(2,i),10000));operation=api(name);
  }
  if(!operation.done||operation.error||!operation.response||typeof operation.response.downloadUri!=='string')throw new Error('PDF export pending or failed');
  var uri=operation.response.downloadUri;
  if(operation.metadata&&operation.metadata.resourceKey)headers['X-Goog-Drive-Resource-Keys']=TEAM_TRIAL.document_id+'/'+operation.metadata.resourceKey;
  for(var redirect=0;redirect<5;redirect++){
    if(!/^https:\/\/(?:[A-Za-z0-9-]+\.)*(?:google\.com|googleusercontent\.com|googleapis\.com)\//.test(uri))throw new Error('Invalid download host');
    var response=UrlFetchApp.fetch(uri,{headers:headers,followRedirects:false,muteHttpExceptions:true}),code=response.getResponseCode();
    if(code>=300&&code<400){var h=response.getHeaders();uri=h.Location||h.location;headers={};continue;}
    if(code!==200)throw new Error('PDF download failed');var bytes=response.getBlob().getBytes();
    if(bytes.length>40*1024*1024||String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')throw new Error('Invalid PDF');
    return{base64:Utilities.base64Encode(bytes)};
  }
  throw new Error('Too many PDF redirects');
}
