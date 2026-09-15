-- Regression hardening: keep library inventory correct on loan return.
-- The return API may race with another request; inventory is changed only when
-- the loan actually transitions borrowed -> returned.
CREATE TRIGGER IF NOT EXISTS trg_library_loan_increment_on_return
AFTER UPDATE OF status ON library_loans
WHEN OLD.status = 'borrowed' AND NEW.status = 'returned'
BEGIN
  UPDATE library_books
     SET available_copies = MIN(total_copies, available_copies + 1)
   WHERE id = NEW.book_id AND school_id = NEW.school_id;
END;
