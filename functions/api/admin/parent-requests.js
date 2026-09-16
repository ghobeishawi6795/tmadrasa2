import {q} from "../_shared/db.js";import {authenticate,requirePermission} from "../_shared/auth.js";import {ok,errors} from "../_shared/response.js";import {readJson,requireFields,withErrorHandling} from "../_shared/validate.js";import {notifyUsers} from "../_shared/notify.js";
export const onRequestGet=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'parent_requests.view');const db=q(env);const r=await db.all(`SELECT pr.*,u.full_name parent_name,su.full_name student_name FROM parent_requests pr JOIN parents p ON p.id=pr.parent_id JOIN users u ON u.id=p.user_id LEFT JOIN students s ON s.id=pr.student_id LEFT JOIN users su ON su.id=s.user_id WHERE pr.school_id=? ORDER BY pr.created_at DESC LIMIT 300`,user.school_id);return ok(r.results);});
export const onRequestPatch=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'parent_requests.manage');const b=await readJson(request);requireFields(b,['id','status']);if(!['pending','approved','rejected','completed'].includes(b.status))throw errors.validation('status نامعتبر است');const db=q(env);
const reqRow=await db.first(`SELECT pr.title,p.user_id parent_user_id FROM parent_requests pr JOIN parents p ON p.id=pr.parent_id WHERE pr.id=? AND pr.school_id=?`,b.id,user.school_id);
if(!reqRow)throw errors.notFound('درخواست پیدا نشد');
// COALESCE: a plain status change from the dropdown (admin/operations.html)
// doesn't send admin_note, and must not wipe out a previously-written one.
const r=await db.run(`UPDATE parent_requests SET status=?,admin_note=COALESCE(?,admin_note),updated_at=datetime('now') WHERE id=? AND school_id=?`,b.status,b.admin_note!==undefined?b.admin_note:null,b.id,user.school_id);if(!r.success)throw errors.server();
const statusLabel={pending:'در انتظار',approved:'تأیید شد',rejected:'رد شد',completed:'تکمیل شد'}[b.status];
await notifyUsers(env,user.school_id,[reqRow.parent_user_id],'parent_request',`وضعیت درخواست شما تغییر کرد: ${statusLabel}`,reqRow.title);
return ok(null,'درخواست بروزرسانی شد');});
