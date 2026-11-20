-- Include account-type changes in the existing employee audit trail.
ALTER TABLE public.employee_edit_changes DROP CONSTRAINT employee_edit_changes_field_check;
ALTER TABLE public.employee_edit_changes ADD CONSTRAINT employee_edit_changes_field_check
    CHECK (field IN ('employee_id', 'full_name', 'email', 'role', 'is_active', 'department', 'account_role'));
