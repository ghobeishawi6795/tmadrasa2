import {q} from "../_shared/db.js";import {authenticate,requirePermission} from "../_shared/auth.js";import {getTeacherRecord} from "../_shared/ownership.js";import {ok,created,errors} from "../_shared/response.js";import {readJson,requireFields,withErrorHandling} from "../_shared/validate.js";import {notifyUsers} from "../_shared/notify.js";import {writeAudit} from "../_shared/audit.js";
export const onRequestGet=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'meetings.view');const t=await getTeacherRecord(env,user.id),db=q(env);const r=await db.all(`SELECT m.*,pu.full_name parent_name,su.full_name student_name FROM parent_meetings m JOIN parents p ON p.id=m.parent_id JOIN users pu ON pu.id=p.user_id JOIN students s ON s.id=m.student_id JOIN users su ON su.id=s.user_id WHERE m.teacher_id=? AND m.school_id=? ORDER BY m.scheduled_at DESC`,t.id,user.school_id);return ok(r.results);});
export const onRequestPatch=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'meetings.manage');const t=await getTeacherRecord(env,user.id),b=await readJson(request);requireFields(b,['id','status']);const db=q(env);if(!['requested','confirmed','completed','cancelled'].includes(b.status))throw errors.validation('status نامعتبر است');
const meeting=await db.first(`SELECT m.scheduled_at,pu.id parent_user_id FROM parent_meetings m JOIN parents p ON p.id=m.parent_id JOIN users pu ON pu.id=p.user_id WHERE m.id=? AND m.teacher_id=? AND m.school_id=?`,b.id,t.id,user.school_id);
if(!meeting)throw errors.notFound('جلسه پیدا نشد');
// notes is optional here: a plain status change (the common case, e.g. the
// dropdown in teacher/meetings.html) must not silently wipe existing notes,
// so COALESCE keeps the old value when notes wasn't sent at all -- only an
// explicit notes value (including "") overwrites it.
await db.run(`UPDATE parent_meetings SET status=?,notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=? AND teacher_id=? AND school_id=?`,b.status,b.notes!==undefined?b.notes:null,b.id,t.id,user.school_id);
const statusLabel={requested:'درخواست شد',confirmed:'تأیید شد',completed:'انجام شد',cancelled:'لغو شد'}[b.status];
await notifyUsers(env,user.school_id,[meeting.parent_user_id],'meeting',`وضعیت جلسه‌ی اولیا تغییر کرد: ${statusLabel}`,meeting.scheduled_at);
return ok(null,'جلسه بروزرسانی شد');});

// POST -- the teacher schedules a meeting with a parent of one of THEIR students.
// (Until now only parents could open a meeting; the teacher could merely change its status.)
// A teacher-initiated meeting is created already 'confirmed' and the parent is notified.
export const onRequestPost=withErrorHandling(async({request,env})=>{
const {user}=await authenticate(request,env);
await requirePermission(env,user,'meetings.manage');
const t=await getTeacherRecord(env,user.id,user.school_id),b=await readJson(request);
requireFields(b,['student_id','scheduled_at']);
const studentId=Number(b.student_id);
if(!Number.isInteger(studentId)||studentId<=0)throw errors.validation('دانش‌آموز نامعتبر است');
if(typeof b.scheduled_at!=='string'||!Number.isFinite(Date.parse(b.scheduled_at)))throw errors.validation('زمان جلسه نامعتبر است');
const duration=Number(b.duration_minutes||20);
if(!Number.isInteger(duration)||duration<10||duration>180)throw errors.validation('مدت جلسه باید بین ۱۰ تا ۱۸۰ دقیقه باشد');
if(b.topic!==undefined&&b.topic!==null&&(typeof b.topic!=='string'||b.topic.length>500))throw errors.validation('موضوع جلسه نامعتبر است (حداکثر ۵۰۰ نویسه)');
const db=q(env);
const teaches=await db.first(`SELECT 1 x FROM class_teachers ct JOIN class_students cs ON cs.class_id=ct.class_id AND cs.school_id=ct.school_id WHERE ct.teacher_id=? AND cs.student_id=? AND ct.school_id=?`,t.id,studentId,user.school_id);
if(!teaches)throw errors.forbidden('این دانش‌آموز جزو کلاس‌های شما نیست');
const parents=(await db.all(`SELECT p.id,p.user_id FROM parent_students ps JOIN parents p ON p.id=ps.parent_id AND p.school_id=ps.school_id WHERE ps.student_id=? AND ps.school_id=? AND p.deleted_at IS NULL`,studentId,user.school_id)).results;
if(!parents.length)throw errors.validation('برای این دانش‌آموز والدی متصل نشده است؛ ابتدا مدیر مدرسه باید والد را به او وصل کند');
let parent;
if(b.parent_id!==undefined&&b.parent_id!==null&&b.parent_id!==''){
parent=parents.find(p=>p.id===Number(b.parent_id));
if(!parent)throw errors.validation('این والد به دانش‌آموز انتخاب‌شده متصل نیست');
}else if(parents.length===1){parent=parents[0];}
else throw errors.validation('این دانش‌آموز بیش از یک والد دارد؛ والد مورد نظر را انتخاب کنید');
const topic=(b.topic||'').trim()||null;
const r=await db.run(`INSERT INTO parent_meetings(school_id,teacher_id,student_id,parent_id,scheduled_at,duration_minutes,status,topic) VALUES(?,?,?,?,?,?,'confirmed',?)`,user.school_id,t.id,studentId,parent.id,b.scheduled_at,duration,topic);
await notifyUsers(env,user.school_id,[parent.user_id],'meeting',`${user.full_name||'معلم'} برای شما جلسه‌ای تعیین کرد`,topic||b.scheduled_at);
await writeAudit(env,{schoolId:user.school_id,actorUserId:user.id,action:'meeting.create_by_teacher',entityType:'parent_meeting',entityId:r.meta.last_row_id,meta:{student_id:studentId,parent_id:parent.id,scheduled_at:b.scheduled_at},request});
return created({id:r.meta.last_row_id},'جلسه ثبت شد');});
