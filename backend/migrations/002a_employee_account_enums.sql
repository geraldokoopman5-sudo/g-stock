CREATE TYPE public.employee_account_permission AS ENUM (
    'none',
    'manage_employee_accounts'
);

CREATE TYPE public.employee_account_status AS ENUM (
    'active',
    'inactive'
);

ALTER TABLE public.employees
    ALTER COLUMN can_manage_employee_accounts DROP DEFAULT,
    ALTER COLUMN is_active DROP DEFAULT;

ALTER TABLE public.employees
    ALTER COLUMN can_manage_employee_accounts TYPE public.employee_account_permission
        USING (CASE
            WHEN can_manage_employee_accounts THEN 'manage_employee_accounts'
            ELSE 'none'
        END)::public.employee_account_permission,
    ALTER COLUMN is_active TYPE public.employee_account_status
        USING (CASE
            WHEN is_active THEN 'active'
            ELSE 'inactive'
        END)::public.employee_account_status;

ALTER TABLE public.employees RENAME COLUMN can_manage_employee_accounts TO account_permission;
ALTER TABLE public.employees RENAME COLUMN is_active TO account_status;

ALTER TABLE public.employees
    ALTER COLUMN account_permission SET DEFAULT 'none',
    ALTER COLUMN account_status SET DEFAULT 'active';
