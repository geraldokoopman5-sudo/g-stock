-- Remove the explicitly retired Oxford sample catalogue from the site.
-- This one-time administrative cleanup keeps original quantities and history;
-- normal API deletion continues to require zero stock.
DO $$
DECLARE
    target_id uuid;
BEGIN
    SELECT id INTO target_id
    FROM public.brands
    WHERE id = '87c9c351-a00d-40dd-9dac-b6679b928694'
      AND brand_name = 'Oxford'
      AND archived_at IS NULL
    FOR NO KEY UPDATE;

    IF target_id IS NOT NULL THEN
        -- Stock writes take the same parent lock, so they cannot race this cleanup.
        UPDATE public.inventory_items
        SET archived_at = clock_timestamp()
        WHERE brand_id = target_id AND archived_at IS NULL;

        UPDATE public.brands
        SET archived_at = clock_timestamp()
        WHERE id = target_id;
    END IF;
END;
$$;
