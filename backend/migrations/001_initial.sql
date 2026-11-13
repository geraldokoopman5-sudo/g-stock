-- G-Stock baseline schema. The migration runner supplies the transaction.

CREATE TYPE public.account_role AS ENUM ('Nemployee', 'Stock Manager', 'Staff Manager');

-- One comparison rule for catalogue names, warehouse addresses and SKUs.
CREATE FUNCTION public.normalize_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
RETURN lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));

CREATE TABLE public.employees (
    id uuid PRIMARY KEY,
    employee_id varchar(32) NOT NULL CHECK (public.normalize_key(employee_id) <> ''),
    full_name varchar(100) NOT NULL CHECK (public.normalize_key(full_name) <> ''),
    email varchar(254) NOT NULL CHECK (public.normalize_key(email) <> ''),
    account_role public.account_role NOT NULL,
    role varchar(80) NOT NULL CHECK (public.normalize_key(role) <> ''),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employees_employee_id_uq ON public.employees (lower(employee_id));
CREATE UNIQUE INDEX employees_email_uq ON public.employees (lower(email));

CREATE TABLE public.employee_credentials (
    employee_id uuid PRIMARY KEY REFERENCES public.employees (id),
    password_hash text NOT NULL CHECK (public.normalize_key(password_hash) <> '')
);

CREATE TABLE public.employee_edits (
    id uuid PRIMARY KEY,
    target_employee_id uuid NOT NULL REFERENCES public.employees (id),
    edited_by_id uuid NOT NULL REFERENCES public.employees (id),
    editor_employee_id varchar(32) NOT NULL CHECK (public.normalize_key(editor_employee_id) <> ''),
    editor_full_name varchar(100) NOT NULL CHECK (public.normalize_key(editor_full_name) <> ''),
    editor_role varchar(80) NOT NULL CHECK (public.normalize_key(editor_role) <> ''),
    edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_edit_changes (
    edit_id uuid NOT NULL REFERENCES public.employee_edits (id),
    field varchar(20) NOT NULL CHECK (field IN ('employee_id', 'full_name', 'email', 'role', 'is_active')),
    before_value text NOT NULL,
    after_value text NOT NULL,
    PRIMARY KEY (edit_id, field),
    CONSTRAINT employee_edit_values_differ CHECK (before_value <> after_value)
);

CREATE TABLE public.auth_sessions (
    id uuid PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES public.employees (id),
    remember_me boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at timestamptz NOT NULL DEFAULT now(),
    absolute_expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revocation_reason varchar(40) CHECK (
        revocation_reason IN ('logout', 'logout-all', 'password-change', 'token-reuse', 'admin')
    ),
    CONSTRAINT auth_session_time_order CHECK (
        created_at <= last_refreshed_at
        AND last_refreshed_at <= idle_expires_at
        AND idle_expires_at <= absolute_expires_at
    )
);

CREATE TABLE public.refresh_tokens (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES public.auth_sessions (id),
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    replaced_by_token_id uuid,
    UNIQUE (id, session_id),
    CONSTRAINT refresh_token_time_order CHECK (created_at <= expires_at),
    CONSTRAINT refresh_token_rotation_pair CHECK (
        (consumed_at IS NULL) = (replaced_by_token_id IS NULL)
    ),
    CONSTRAINT refresh_token_successor_is_different CHECK (replaced_by_token_id <> id),
    CONSTRAINT refresh_token_successor_same_session FOREIGN KEY (replaced_by_token_id, session_id)
        REFERENCES public.refresh_tokens (id, session_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX refresh_tokens_one_unconsumed_uq
    ON public.refresh_tokens (session_id)
    WHERE consumed_at IS NULL;

-- A row CHECK cannot look up a different table.
CREATE FUNCTION public.check_refresh_token_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.expires_at > (
        SELECT absolute_expires_at FROM public.auth_sessions WHERE id = NEW.session_id
    ) THEN
        RAISE EXCEPTION 'Refresh token expires after its session'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_token_expiry
    BEFORE INSERT OR UPDATE OF expires_at, session_id ON public.refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION public.check_refresh_token_expiry();

CREATE FUNCTION public.prevent_session_absolute_expiry_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.absolute_expires_at IS DISTINCT FROM OLD.absolute_expires_at THEN
        RAISE EXCEPTION 'Session absolute expiry is fixed at sign-in'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER session_absolute_expiry_fixed
    BEFORE UPDATE OF absolute_expires_at ON public.auth_sessions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_session_absolute_expiry_change();

CREATE TABLE public.warehouses (
    id uuid PRIMARY KEY,
    name varchar(100) NOT NULL CHECK (public.normalize_key(name) <> ''),
    street_name varchar NOT NULL CHECK (public.normalize_key(street_name) <> ''),
    suburb_name varchar NOT NULL CHECK (public.normalize_key(suburb_name) <> ''),
    city varchar NOT NULL CHECK (public.normalize_key(city) <> ''),
    province varchar NOT NULL CHECK (public.normalize_key(province) <> ''),
    postal_code integer NOT NULL
);

CREATE UNIQUE INDEX warehouses_name_uq ON public.warehouses (public.normalize_key(name));
CREATE UNIQUE INDEX warehouses_address_uq ON public.warehouses (
    public.normalize_key(street_name),
    public.normalize_key(suburb_name),
    public.normalize_key(city),
    public.normalize_key(province),
    postal_code
);

CREATE TABLE public.brands (
    id uuid PRIMARY KEY,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses (id),
    brand_name varchar(100) NOT NULL CHECK (public.normalize_key(brand_name) <> ''),
    description varchar(250) NOT NULL DEFAULT '',
    date_added timestamptz NOT NULL DEFAULT now(),
    profile_photo bytea,
    archived_at timestamptz,
    UNIQUE (id, warehouse_id)
);

CREATE UNIQUE INDEX brands_warehouse_name_uq
    ON public.brands (warehouse_id, public.normalize_key(brand_name));

CREATE TABLE public.inventory_items (
    id uuid PRIMARY KEY,
    brand_id uuid NOT NULL,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses (id),
    name varchar(100) NOT NULL CHECK (public.normalize_key(name) <> ''),
    sku varchar(40) CHECK (public.normalize_key(sku) <> ''),
    quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 1000000000),
    unit varchar(5) NOT NULL CHECK (unit IN ('units', 'boxes', 'rolls', 'cases', 'pairs')),
    added_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (id, brand_id, warehouse_id),
    CONSTRAINT inventory_item_brand_in_warehouse FOREIGN KEY (brand_id, warehouse_id)
        REFERENCES public.brands (id, warehouse_id)
);

CREATE UNIQUE INDEX inventory_items_sku_uq
    ON public.inventory_items (public.normalize_key(sku))
    WHERE sku IS NOT NULL;

CREATE TABLE public.inventory_activity (
    id uuid PRIMARY KEY,
    type varchar(20) NOT NULL,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses (id),
    brand_id uuid,
    item_id uuid,
    entity_name varchar(100) NOT NULL CHECK (public.normalize_key(entity_name) <> ''),
    actor_id uuid NOT NULL REFERENCES public.employees (id),
    actor_employee_id varchar(32) NOT NULL CHECK (public.normalize_key(actor_employee_id) <> ''),
    actor_full_name varchar(100) NOT NULL CHECK (public.normalize_key(actor_full_name) <> ''),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    previous_quantity integer CHECK (previous_quantity BETWEEN 0 AND 1000000000),
    quantity integer CHECK (quantity BETWEEN 0 AND 1000000000),
    unit varchar(5) CHECK (unit IN ('units', 'boxes', 'rolls', 'cases', 'pairs')),
    CONSTRAINT inventory_activity_brand_scope FOREIGN KEY (brand_id, warehouse_id)
        REFERENCES public.brands (id, warehouse_id),
    CONSTRAINT inventory_activity_item_scope FOREIGN KEY (item_id, brand_id, warehouse_id)
        REFERENCES public.inventory_items (id, brand_id, warehouse_id),
    CONSTRAINT inventory_activity_event_payload CHECK (
        CASE type
            WHEN 'warehouse-created' THEN
                brand_id IS NULL AND item_id IS NULL
                AND previous_quantity IS NULL AND quantity IS NULL AND unit IS NULL
            WHEN 'brand-created' THEN
                brand_id IS NOT NULL AND item_id IS NULL
                AND previous_quantity IS NULL AND quantity IS NULL AND unit IS NULL
            WHEN 'brand-deleted' THEN
                brand_id IS NOT NULL AND item_id IS NULL
                AND previous_quantity IS NULL AND quantity IS NULL AND unit IS NULL
            WHEN 'item-created' THEN
                brand_id IS NOT NULL AND item_id IS NOT NULL
                AND previous_quantity IS NULL AND quantity IS NOT NULL AND unit IS NOT NULL
            WHEN 'item-deleted' THEN
                brand_id IS NOT NULL AND item_id IS NOT NULL
                AND previous_quantity IS NULL AND quantity IS NOT NULL AND unit IS NOT NULL
            WHEN 'quantity-updated' THEN
                brand_id IS NOT NULL AND item_id IS NOT NULL
                AND previous_quantity IS NOT NULL AND quantity IS NOT NULL
                AND previous_quantity <> quantity AND unit IS NOT NULL
            ELSE false
        END
    )
);
