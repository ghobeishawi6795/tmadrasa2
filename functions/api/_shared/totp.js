// RFC 6238 TOTP helpers using Web Crypto. Secrets are encrypted at rest by AES-GCM.
const te = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function keyFromEnv(env) {
  const raw = env.TOTP_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOTP_ENCRYPTION_KEY is not configured");
  const bytes = /^[0-9a-f]{64}$/i.test(raw) ? unhex(raw) : unb64(raw);
  if (bytes.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes (base64 or 64-char hex)");
  return crypto.subtle.importKey("raw", bytes, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
}
function unhex(h){ const a=new Uint8Array(h.length/2); for(let i=0;i<a.length;i++)a[i]=parseInt(h.slice(i*2,i*2+2),16); return a; }
export async function encryptTotpSecret(env, secret) {
  const key=await keyFromEnv(env), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,te.encode(secret));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decryptTotpSecret(env, packed) {
  const [ivS,ctS]=String(packed||"").split("."); if(!ivS||!ctS) throw new Error("Invalid TOTP secret");
  const key=await keyFromEnv(env); const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(ivS)},key,unb64(ctS));
  return new TextDecoder().decode(pt);
}
export function base32Encode(bytes){ const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits=0,val=0,out=""; for(const byte of bytes){val=(val<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(val>>>(bits-5))&31];bits-=5;}} if(bits) out+=alphabet[(val<<(5-bits))&31]; return out; }
export function base32Decode(str){ const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits=0,val=0,out=[]; for(const ch of String(str).replace(/=+$/,'').toUpperCase().replace(/\s/g,'')){const n=alphabet.indexOf(ch);if(n<0)throw new Error('Invalid base32');val=(val<<5)|n;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8;}}return new Uint8Array(out); }
export function generateTotpSecret(){ return base32Encode(crypto.getRandomValues(new Uint8Array(20))); }
export async function totpCode(secret, counter){
  const key=await crypto.subtle.importKey("raw",base32Decode(secret),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const buf=new ArrayBuffer(8),view=new DataView(buf); view.setUint32(0,Math.floor(counter/0x100000000)); view.setUint32(4,counter>>>0);
  const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,buf)); const off=mac[mac.length-1]&15;
  const bin=((mac[off]&127)<<24)|(mac[off+1]<<16)|(mac[off+2]<<8)|mac[off+3]; return String(bin%1000000).padStart(6,'0');
}
// Returns the matched time-step counter on success, or null if the code
// doesn't match any step in the window. Callers that need replay protection
// must additionally call consumeTotpStep() with the returned step -- a
// matching code alone does not guarantee the step hasn't been used before.
export async function verifyTotp(secret, code, window=1){ const c=Math.floor(Date.now()/30000); const clean=String(code||'').replace(/\D/g,''); if(clean.length!==6)return null; for(let i=-window;i<=window;i++) if((await totpCode(secret,c+i))===clean)return c+i; return null; }

// Atomically checks-and-records that `step` has not been used before for this
// user (steps must be used in non-decreasing order), preventing a captured
// code from being replayed within its ~90s validity window. Returns true if
// the step was newly consumed, false if it was already used (or older than
// the last used step) -- callers must treat false the same as a wrong code.
export async function consumeTotpStep(db, userId, step){
  const r = await db.run(
    `UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)`,
    step, userId, step
  );
  return !!r.meta?.changes;
}
