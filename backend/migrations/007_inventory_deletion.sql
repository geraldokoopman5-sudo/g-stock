-- Keep deleted warehouses and their catalogue records for activity history.
ALTER TABLE public.warehouses ADD COLUMN archived_at timestamptz;

ALTER TABLE public.inventory_activity DROP CONSTRAINT inventory_activity_event_payload;
ALTER TABLE public.inventory_activity ADD CONSTRAINT inventory_activity_event_payload CHECK (
    CASE type
        WHEN 'warehouse-created' THEN
            brand_id IS NULL AND item_id IS NULL
            AND previous_quantity IS NULL AND quantity IS NULL AND unit IS NULL
        WHEN 'warehouse-deleted' THEN
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
);
