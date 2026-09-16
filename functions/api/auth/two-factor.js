// /api/auth/two-factor
// GET: current 2FA status
// POST {action:"setup"} -> secret + otpauth URI (do not log/store raw secret)
// POST {action:"enable", code} -> verifies pending setup
// POST {action:"disable", code} -> disables existing 2FA
import { q } from "../_shared/db.js";
import { authenticate } from "../_shared/auth.js";
import { ok, errors } from "../_shared/response.js";
import { readJson, requireFields, withErrorHandling } from "../_shared/validate.js";
import { encryptTotpSecret, decryptTotpSecret, generateTotpSecret, verifyTotp, consumeTotpStep } from "../_shared/totp.js";
import { hashToken } from "../_shared/crypto.js";
import { writeAudit } from "../_shared/audit.js";

export const onRequestGet = withErrorHandling(async ({request,env}) => {
  const {user}=await authenticate(request,env); return ok({enabled:!!user.two_factor_enabled});
});
export const onRequestPost = withErrorHandling(async ({request,env}) => {
  const {user}=await authenticate(request,env); const body=await readJson(request); requireFields(body,["action"]); const db=q(env);
  if(body.action==='setup'){
    if(user.two_factor_enabled) throw errors.conflict('ورود دومرحله‌ای از قبل فعال است؛ ابتدا آن را غیرفعال کنید');
    const secret=generateTotpSecret(); const enc=await encryptTotpSecret(env,secret);
    await db.batch([{sql:`UPDATE users SET totp_secret_enc = ?, two_factor_enabled = 0, totp_last_step = NULL WHERE id = ?`,params:[enc,user.id]},{sql:`DELETE FROM two_factor_backup_codes WHERE user_id=?`,params:[user.id]}]);
    const issuer=encodeURIComponent('مدرسه'); const account=encodeURIComponent(user.username);
    return ok({secret,otpauth_uri:`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`});
  }
  if(body.action==='enable'){
    requireFields(body,['code']); if(!user.totp_secret_enc) throw errors.validation('ابتدا راه‌اندازی 2FA را انجام دهید');
    const secret=await decryptTotpSecret(env,user.totp_secret_enc); const step=await verifyTotp(secret,body.code); if(step===null || !await consumeTotpStep(db,user.id,step)) throw errors.validation('کد 2FA صحیح نیست');
    const backup=[]; const statements=[{sql:`UPDATE users SET two_factor_enabled = 1 WHERE id = ?`,params:[user.id]}]; for(let i=0;i<10;i++){const code=Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,10);backup.push(code);statements.push({sql:`INSERT INTO two_factor_backup_codes(user_id,code_hash) VALUES(?,?)`,params:[user.id,await hashToken(code)]});} await db.batch(statements);
    await writeAudit(env,{schoolId:user.school_id,actorUserId:user.id,action:'auth.2fa_enable',entityType:'user',entityId:user.id,request});
    return ok({enabled:true,backup_codes:backup},'ورود دومرحله‌ای فعال شد؛ کدهای پشتیبان را فقط همین یک‌بار ذخیره کنید');
  }
  if(body.action==='disable'){
    requireFields(body,['code']); if(!user.two_factor_enabled) return ok({enabled:false});
    const secret=await decryptTotpSecret(env,user.totp_secret_enc); const step=await verifyTotp(secret,body.code); if(step===null || !await consumeTotpStep(db,user.id,step)) throw errors.validation('کد 2FA صحیح نیست');
    await db.batch([{sql:`UPDATE users SET two_factor_enabled=0,totp_secret_enc=NULL WHERE id=?`,params:[user.id]},{sql:`DELETE FROM two_factor_backup_codes WHERE user_id=?`,params:[user.id]},{sql:`UPDATE sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL`,params:[user.id]}]);
    await writeAudit(env,{schoolId:user.school_id,actorUserId:user.id,action:'auth.2fa_disable',entityType:'user',entityId:user.id,request});
    return ok({enabled:false},'ورود دومرحله‌ای غیرفعال شد');
  }
  throw errors.validation('action نامعتبر است');
});
