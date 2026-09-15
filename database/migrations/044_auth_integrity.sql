-- Auth integrity hardening: enforce the single bootstrap super-admin invariant
-- at the database layer as well as in the public endpoint. This closes the
-- concurrent-request race where two requests could both pass the pre-check.
CREATE TRIGGER IF NOT EXISTS trg_single_super_admin
BEFORE INSERT ON user_roles
FOR EACH ROW
WHEN (SELECT key FROM roles WHERE id = NEW.role_id) = 'super_admin'
 AND EXISTS (
   SELECT 1
   FROM user_roles ur
   JOIN roles r ON r.id = ur.role_id
   WHERE r.key = 'super_admin'
 )
BEGIN
  SELECT RAISE(ABORT, 'only one super_admin is allowed');
END;
