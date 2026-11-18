-- Persist the details already collected by the staff workspace.
ALTER TABLE public.employees ADD COLUMN department varchar(80) NOT NULL DEFAULT '';
ALTER TABLE public.employee_edit_changes DROP CONSTRAINT employee_edit_changes_field_check;
ALTER TABLE public.employee_edit_changes ADD CONSTRAINT employee_edit_changes_field_check
    CHECK (field IN ('employee_id', 'full_name', 'email', 'role', 'is_active', 'department'));

ALTER TABLE public.warehouses
    ADD COLUMN contact_name varchar(100) NOT NULL DEFAULT '',
    ADD COLUMN contact_email varchar(254) NOT NULL DEFAULT '',
    ADD COLUMN notes varchar(1000) NOT NULL DEFAULT '';

ALTER TABLE public.inventory_items
    ADD COLUMN location varchar(80) NOT NULL DEFAULT '',
    ADD COLUMN reorder_level integer NOT NULL DEFAULT 0
        CHECK (reorder_level BETWEEN 0 AND 1000000000);
