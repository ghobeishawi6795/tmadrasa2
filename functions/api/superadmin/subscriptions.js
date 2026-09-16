import {q} from "../_shared/db.js";import {authenticate,requireRole} from "../_shared/auth.js";import {ok,errors} from "../_shared/response.js";import {readJson,requireFields,withErrorHandling} from "../_shared/validate.js";import {writeAudit} from "../_shared/audit.js";
export const onRequestGet=withErrorHandling(async({request,env})=>{const {roles}=await authenticate(request,env);requireRole(roles,'super_admin');const db=q(env);const r=await db.all(`SELECT id,name,plan,subscription_status,subscription_expires_at,trial_ends_at,active FROM schools WHERE id<>0 ORDER BY id DESC`);return ok(r.results);});
export const onRequestPatch=withErrorHandling(async({request,env})=>{const {user,roles}=await authenticate(request,env);requireRole(roles,'super_admin');const b=await readJson(request);requireFields(b,['school_id']);const db=q(env);if(b.status && !['active','past_due','cancelled','suspended'].includes(b.status))throw errors.validation('وضعیت اشتراک نامعتبر است');
// BUGFIX: this used to only ever turn `active` OFF when status became
// 'suspended', and never back ON when status later changed away from
// 'suspended' -- since login is gated on `active` (see auth/login.js), a
// school stayed permanently locked out after any suspend-then-unsuspend
// cycle here, even though subscription_status looked fully "active" again.
// Fix is transition-based (old status -> new status), not just "is the new
// status suspended" -- so a school independently deactivated via the
// separate superadmin/schools.js toggle (for an unrelated reason, with
// subscription_status left as-is) is never silently reactivated just
// because this endpoint re-saved an unrelated field like the plan.
let activeSql='active';
if(b.status){
    const current=await db.first(`SELECT subscription_status FROM schools WHERE id=?`,b.school_id);
    if(!current)throw errors.notFound('مدرسه پیدا نشد');
    if(b.status==='suspended')activeSql='0';
    else if(current.subscription_status==='suspended')activeSql='1';
}
await db.run(`UPDATE schools SET plan=COALESCE(?,plan),subscription_status=COALESCE(?,subscription_status),subscription_expires_at=COALESCE(?,subscription_expires_at),trial_ends_at=COALESCE(?,trial_ends_at),active=${activeSql} WHERE id=?`,b.plan||null,b.status||null,b.expires_at||null,b.trial_ends_at||null,b.school_id);
await writeAudit(env,{schoolId:b.school_id,actorUserId:user.id,action:'superadmin.subscription_update',entityType:'school',entityId:b.school_id,meta:{plan:b.plan||undefined,status:b.status||undefined},request});
return ok(null,'اشتراک بروزرسانی شد');});
