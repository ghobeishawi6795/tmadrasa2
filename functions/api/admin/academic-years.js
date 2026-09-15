import {q} from "../_shared/db.js"; import {authenticate,requirePermission} from "../_shared/auth.js"; import {ok,created,errors} from "../_shared/response.js"; import {readJson,requireFields,withErrorHandling} from "../_shared/validate.js";
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/; const YEAR_STATUSES=['open','closed','archived'];
export const onRequestGet=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'academic_years.view');const db=q(env);const r=await db.all(`SELECT ay.*, (SELECT COUNT(*) FROM classes c WHERE c.academic_year_id=ay.id AND c.deleted_at IS NULL) class_count,(SELECT COUNT(*) FROM student_enrollments se WHERE se.academic_year_id=ay.id AND se.status='active') student_count FROM academic_years ay WHERE ay.school_id=? ORDER BY ay.start_date DESC,ay.id DESC`,user.school_id);return ok(r.results);});
export const onRequestPost=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'academic_years.manage');const b=await readJson(request);const db=q(env);
if(b.action==='promote_preview'){
    // Read-only helper for the UI: for the current year's classes, suggest a
    // same-name match in the target year (grade advancement, e.g. "هفتم الف"
    // -> "هشتم الف", never has a same-name match and is correctly left for
    // the admin to map by hand instead of silently mis-promoting).
    requireFields(b,['to_year_id']);
    const target=await db.first(`SELECT * FROM academic_years WHERE id=? AND school_id=?`,b.to_year_id,user.school_id);
    if(!target)throw errors.notFound('سال مقصد پیدا نشد');
    const source=await db.first(`SELECT * FROM academic_years WHERE school_id=? AND is_current=1 ORDER BY id DESC LIMIT 1`,user.school_id);
    if(!source)throw errors.notFound('سال جاری پیدا نشد');
    const sourceClasses=await db.all(`SELECT c.id,c.name,c.grade,(SELECT COUNT(*) FROM student_enrollments se WHERE se.class_id=c.id AND se.academic_year_id=? AND se.status='active') student_count FROM classes c WHERE c.school_id=? AND c.academic_year_id=? AND c.deleted_at IS NULL ORDER BY c.name`,source.id,user.school_id,source.id);
    const targetClasses=await db.all(`SELECT id,name,grade FROM classes WHERE school_id=? AND academic_year_id=? AND deleted_at IS NULL ORDER BY name`,user.school_id,target.id);
    const byName=new Map();
    for(const t of targetClasses.results){ byName.set(t.name, (byName.get(t.name)||[]).concat(t)); }
    const suggestions=sourceClasses.results.map(c=>{
        const matches=byName.get(c.name)||[];
        return { ...c, suggested_to_class_id: matches.length===1 ? matches[0].id : null };
    });
    return ok({ source_classes: suggestions, target_classes: targetClasses.results });
}
if(b.action==='promote_auto'){
    requireFields(b,['to_year_id']);
    const target=await db.first(`SELECT * FROM academic_years WHERE id=? AND school_id=?`,b.to_year_id,user.school_id);
    if(!target)throw errors.notFound('سال مقصد پیدا نشد');
    if(target.status!=='open')throw errors.validation('سال مقصد باید باز باشد');
    const source=await db.first(`SELECT * FROM academic_years WHERE school_id=? AND is_current=1 ORDER BY id DESC LIMIT 1`,user.school_id);
    if(!source)throw errors.notFound('سال جاری پیدا نشد');
    if(source.id===target.id)throw errors.validation('سال مقصد نمی‌تواند همان سال جاری باشد');
    if(target.start_date<=source.start_date)throw errors.validation('سال مقصد باید بعد از سال جاری باشد');

    // Two ways to decide source-class -> target-class pairs:
    // (1) explicit `mapping` from the admin (needed for real grade advancement,
    //     e.g. "هفتم الف" -> "هشتم الف", which never has a same-name match); or
    // (2) same-name auto-match, kept as the pre-existing fallback for schools
    //     that re-use identical class names across years.
    let pairs=[];
    if(Array.isArray(b.mapping)&&b.mapping.length){
        const seenFrom=new Set();
        for(const m of b.mapping){
            const fromId=Number(m?.from_class_id), toId=Number(m?.to_class_id);
            if(!fromId||!toId)continue;
            if(seenFrom.has(fromId))throw errors.validation('هر کلاس مبدأ فقط یک‌بار می‌تواند نگاشت شود');
            seenFrom.add(fromId);
            const src=await db.first(`SELECT id,name FROM classes WHERE id=? AND school_id=? AND academic_year_id=? AND deleted_at IS NULL`,fromId,user.school_id,source.id);
            const dest=await db.first(`SELECT id,name FROM classes WHERE id=? AND school_id=? AND academic_year_id=? AND deleted_at IS NULL`,toId,user.school_id,target.id);
            if(!src||!dest)throw errors.validation('نگاشت کلاس نامعتبر است');
            pairs.push({ srcId:src.id, destId:dest.id });
        }
        if(!pairs.length)throw errors.validation('نگاشت کلاس‌ها خالی است');
    }else{
        const classes=await db.all(`SELECT id,name,grade FROM classes WHERE school_id=? AND academic_year_id=? AND deleted_at IS NULL`,user.school_id,source.id);
        for(const c of classes.results){
            const dests=await db.all(`SELECT id FROM classes WHERE school_id=? AND academic_year_id=? AND name=? AND deleted_at IS NULL ORDER BY id`,user.school_id,target.id,c.name);
            if(dests.results.length!==1)continue; // ambiguous/no match -- left for a manual mapping
            pairs.push({ srcId:c.id, destId:dests.results[0].id });
        }
    }

    let promoted=0,skipped=0;const seen=new Set();const writes=[];
    for(const {srcId,destId} of pairs){
        const rows=await db.all(`SELECT student_id FROM student_enrollments WHERE school_id=? AND academic_year_id=? AND class_id=? AND status='active'`,user.school_id,source.id,srcId);
        for(const row of rows.results){
            if(seen.has(row.student_id))continue;seen.add(row.student_id);
            const existing=await db.first(`SELECT id,class_id,status FROM student_enrollments WHERE school_id=? AND academic_year_id=? AND student_id=?`,user.school_id,target.id,row.student_id);
            if(existing){
                if(existing.status==='active'){skipped++;continue}
                writes.push({sql:`UPDATE student_enrollments SET class_id=?,status='active',joined_at=COALESCE(joined_at,datetime('now')),left_at=NULL WHERE id=?`,params:[destId,existing.id]});
            }else{
                writes.push({sql:`INSERT INTO student_enrollments(school_id,academic_year_id,student_id,class_id,status,joined_at) VALUES(?,?,?,?,'active',datetime('now'))`,params:[user.school_id,target.id,row.student_id,destId]});
            }
            writes.push({sql:`UPDATE student_enrollments SET status='promoted',left_at=datetime('now') WHERE school_id=? AND academic_year_id=? AND student_id=? AND status='active'`,params:[user.school_id,source.id,row.student_id]});
            promoted++;
        }
    }
    if(writes.length)await db.batch(writes);
    return ok({promoted,skipped},'ارتقا انجام شد');
}
requireFields(b,['name','start_date','end_date']);if(typeof b.name!=='string'||!b.name.trim())throw errors.validation('نام سال تحصیلی الزامی است');if(!DATE_RE.test(String(b.start_date))||!DATE_RE.test(String(b.end_date)))throw errors.validation('تاریخ سال تحصیلی نامعتبر است');if(b.start_date>=b.end_date)throw errors.validation('تاریخ شروع باید قبل از پایان باشد');if(b.status!==undefined&&!YEAR_STATUSES.includes(b.status))throw errors.validation('وضعیت سال تحصیلی نامعتبر است');let r;if(b.is_current){const batch=await db.batch([{sql:`UPDATE academic_years SET is_current=0 WHERE school_id=?`,params:[user.school_id]},{sql:`INSERT INTO academic_years(school_id,name,start_date,end_date,status,is_current) VALUES(?,?,?,?,?,?)`,params:[user.school_id,b.name.trim(),b.start_date,b.end_date,b.status||'open',1]}]);r=batch[1];const newYearId=r.meta.last_row_id;await db.batch([{sql:`DELETE FROM class_students WHERE school_id=?`,params:[user.school_id]},{sql:`INSERT OR IGNORE INTO class_students(class_id,student_id,school_id) SELECT se.class_id,se.student_id,se.school_id FROM student_enrollments se WHERE se.school_id=? AND se.academic_year_id=? AND se.status='active'`,params:[user.school_id,newYearId]}]);}else{r=await db.run(`INSERT INTO academic_years(school_id,name,start_date,end_date,status,is_current) VALUES(?,?,?,?,?,?)`,user.school_id,b.name.trim(),b.start_date,b.end_date,b.status||'open',0);}return created({id:r.meta.last_row_id});});
export const onRequestPatch=withErrorHandling(async({request,env})=>{const {user}=await authenticate(request,env);await requirePermission(env,user,'academic_years.manage');const b=await readJson(request);requireFields(b,['id']);const db=q(env);const row=await db.first(`SELECT * FROM academic_years WHERE id=? AND school_id=?`,b.id,user.school_id);if(!row)throw errors.notFound('سال تحصیلی پیدا نشد');if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()))throw errors.validation('نام سال تحصیلی الزامی است');if(b.start_date!==undefined&&!DATE_RE.test(String(b.start_date)))throw errors.validation('تاریخ شروع نامعتبر است');if(b.end_date!==undefined&&!DATE_RE.test(String(b.end_date)))throw errors.validation('تاریخ پایان نامعتبر است');const start=b.start_date===undefined?row.start_date:String(b.start_date),end=b.end_date===undefined?row.end_date:String(b.end_date);if(start>=end)throw errors.validation('تاریخ شروع باید قبل از پایان باشد');if(b.status!==undefined&&!YEAR_STATUSES.includes(b.status))throw errors.validation('وضعیت سال تحصیلی نامعتبر است');const fields=[],vals=[];for(const k of ['name','start_date','end_date','status'])if(b[k]!==undefined){fields.push(`${k}=?`);vals.push(b[k]);}if(b.is_current!==undefined){if(b.is_current && (b.status!==undefined?b.status:row.status)!=='open')throw errors.validation('فقط سال تحصیلی باز می‌تواند جاری باشد');if(!b.is_current && row.is_current)throw errors.validation('ابتدا یک سال تحصیلی دیگر را جاری کنید');fields.push('is_current=?');vals.push(b.is_current?1:0);}if(!fields.length)throw errors.validation('فیلدی برای بروزرسانی نیست');if(b.is_current){const newStatus=b.status!==undefined?b.status:row.status;if(newStatus!=='open')throw errors.validation('فقط سال تحصیلی باز می‌تواند جاری باشد');const reset={sql:`UPDATE academic_years SET is_current=0 WHERE school_id=? AND id<>?`,params:[user.school_id,row.id]};const update={sql:`UPDATE academic_years SET ${fields.join(',')} WHERE id=? AND school_id=?`,params:[...vals,row.id,user.school_id]};const sync={sql:`DELETE FROM class_students WHERE school_id=?`,params:[user.school_id]};const fill={sql:`INSERT OR IGNORE INTO class_students(class_id,student_id,school_id) SELECT se.class_id,se.student_id,se.school_id FROM student_enrollments se WHERE se.school_id=? AND se.academic_year_id=? AND se.status='active'`,params:[user.school_id,row.id]};await db.batch([reset,update,sync,fill]);}else{await db.run(`UPDATE academic_years SET ${fields.join(',')} WHERE id=? AND school_id=?`,...vals,row.id,user.school_id);}return ok(null,'سال تحصیلی بروزرسانی شد');});
