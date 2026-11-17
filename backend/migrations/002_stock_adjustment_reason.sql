ALTER TABLE public.inventory_activity
    ADD COLUMN reason varchar(500),
    ADD CONSTRAINT inventory_activity_reason_check CHECK (
        reason IS NULL OR (type = 'quantity-updated' AND public.normalize_key(reason) <> '')
    );
