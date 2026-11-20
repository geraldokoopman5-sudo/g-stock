-- Job titles use the account-type enum and always follow the account's permissions.
-- Replacing the free-text column also normalizes existing job titles.
ALTER TABLE public.employees DROP COLUMN department;
ALTER TABLE public.employees DROP COLUMN role;
ALTER TABLE public.employees ADD COLUMN role public.account_role
    GENERATED ALWAYS AS (account_role) STORED NOT NULL;

-- Remove department values from history, including entries that only changed a department.
-- Leave genuine password-only audit entries and other profile changes intact.
WITH removed AS (
    DELETE FROM public.employee_edit_changes WHERE field = 'department' RETURNING edit_id
)
DELETE FROM public.employee_edits AS edit
WHERE edit.id IN (SELECT edit_id FROM removed)
  AND NOT EXISTS (
      SELECT 1 FROM public.employee_edit_changes AS change
      WHERE change.edit_id = edit.id AND change.field <> 'department'
  );
ALTER TABLE public.employee_edit_changes DROP CONSTRAINT employee_edit_changes_field_check;
ALTER TABLE public.employee_edit_changes ADD CONSTRAINT employee_edit_changes_field_check
    CHECK (field IN ('employee_id', 'full_name', 'email', 'role', 'is_active', 'account_role'));
