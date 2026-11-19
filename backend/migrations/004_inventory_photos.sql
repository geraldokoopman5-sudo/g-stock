-- Keep image bytes in PostgreSQL; timestamps let clients refresh replaced pictures.
ALTER TABLE public.inventory_items
    ADD COLUMN profile_photo bytea,
    ADD COLUMN photo_updated_at timestamptz,
    ADD CONSTRAINT inventory_items_photo_size CHECK (octet_length(profile_photo) <= 1048576);

ALTER TABLE public.brands ADD COLUMN photo_updated_at timestamptz;
UPDATE public.brands SET photo_updated_at = date_added WHERE profile_photo IS NOT NULL;
