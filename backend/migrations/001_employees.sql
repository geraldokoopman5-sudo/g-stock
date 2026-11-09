CREATE TABLE employees (
    id uuid PRIMARY KEY,
    employee_id varchar(32) NOT NULL CHECK (employee_id ~ '[^[:space:]]'),
    full_name varchar(100) NOT NULL CHECK (full_name ~ '[^[:space:]]'),
    email varchar(254) NOT NULL CHECK (email ~ '[^[:space:]]'),
    department varchar(80) NOT NULL CHECK (department ~ '[^[:space:]]'),
    role varchar(80) NOT NULL CHECK (role ~ '[^[:space:]]'),
    can_manage_employee_accounts boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employees_employee_id_ci_uq
    ON employees (lower(employee_id));

CREATE UNIQUE INDEX employees_email_ci_uq
    ON employees (lower(email));