// Page smoke test: executes every public/**/*.html page's scripts (shared assets/js first) in a Node vm with a stub DOM
// and reports top-level runtime errors (e.g. ReferenceError). Catches the class of bug node --check cannot:
// a function used outside the scope where it was defined. Run: node tests/page-smoke.cjs public
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=process.argv[2];
function stub(){const f=function(){return S};const S=new Proxy(f,{get:(t,k)=>{if(k===Symbol.toPrimitive)return()=> '';if(k==='then')return undefined;if(k==='length')return 0;if(k==='forEach'||k==='map')return()=>[];return S},apply:()=>S,construct:()=>S,set:()=>true});return S}
function mkStore(init){const m=new Map(Object.entries(init||{}));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}}
function runPage(file){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const session=JSON.stringify({token:'t',user:{id:1,school_id:1,full_name:'x'},roles:['admin','teacher','student','parent','super_admin'],expires_at:'2099'});
  const errs=[];
  const S=stub();
  const sandbox={document:S,localStorage:mkStore({madrese_session:session}),sessionStorage:mkStore(),location:{href:'',pathname:'/'+file,search:'',reload(){}},
    fetch:()=>Promise.reject(new Error('offline')),setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},console:{log(){},error(){}},
    URL,URLSearchParams,FormData:function(){return S},Blob:function(){},FileReader:function(){},Intl,Date,Math,JSON,Promise,Array,Object,String,Number,Boolean,RegExp,Error,Map,Set,parseInt,parseFloat,isNaN,encodeURIComponent,decodeURIComponent,navigator:{},history:S,screen:S,performance:{now:()=>0},requestAnimationFrame:()=>0,alert(){},atob:x=>x,btoa:x=>x,Image:function(){},Audio:function(){},MutationObserver:function(){return S},IntersectionObserver:function(){return S},matchMedia:()=>S,getComputedStyle:()=>S,open:()=>S,addEventListener(){},removeEventListener(){},crypto:{}};
  sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;
  const ctx=vm.createContext(sandbox);
  process.on('unhandledRejection',()=>{});
  const re=/<script([^>]*)>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))){
    let code=m[2]; const src=/src="([^"]+)"/.exec(m[1]);
    if(src){ if(/^https?:/.test(src[1]))continue; const p=path.join(root,path.dirname(file),src[1]); if(!fs.existsSync(p))continue; code=fs.readFileSync(p,'utf8'); }
    try{ new vm.Script(code,{filename:src?src[1]:file+'#inline'}).runInContext(ctx,{timeout:2000}); }
    catch(e){ errs.push((src?src[1]:'inline')+': '+e.name+': '+e.message); }
  }
  return errs;
}
const files=require('child_process').execSync(`cd ${root} && find . -name "*.html" | sed 's|^./||'`).toString().trim().split('\n');
let bad=0;
for(const f of files){const e=runPage(f); if(e.length){bad++;console.log(f,'\n   ',e.join('\n    '))}}
console.log('pages checked:',files.length,'with top-level errors:',bad);
