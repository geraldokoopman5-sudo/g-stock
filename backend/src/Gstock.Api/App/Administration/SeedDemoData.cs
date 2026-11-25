using System.Security.Cryptography;
using System.Text;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Npgsql;

namespace Gstock.Api.App.Administration;

internal static class SeedDemoData
{
    internal const string Command = "--seed-demo";

    private static readonly string[] EmployeeNames = [
        "Lerato Dlamini", "Sipho Nkosi", "Jamie Mokoena", "Amina Patel",
        "Thabo Molefe", "Naledi Khumalo", "Pieter Botha", "Zanele Ndlovu",
        "Kabelo Maseko", "Fatima Jacobs", "Daniel Naidoo", "Nomsa Zulu",
        "Andile Mthembu", "Chloe Williams", "Ruan van Wyk", "Buhle Sithole",
        "Tshepo Modise", "Priya Pillay", "Lungile Shabalala", "Ethan Smith",
        "Karabo Phiri", "Megan Adams", "Sibusiso Mhlongo", "Ayesha Khan",
        "Mpho Radebe", "Bianca Meyer", "Sandile Gumede", "Tanya Daniels",
        "Neo Motsepe", "Shanice Petersen", "Vusi Mbatha", "Reuben Thomas",
        "Lindiwe Cele", "Jason Hendricks", "Refilwe Moagi", "Keagan Brown",
        "Nokuthula Ngcobo", "Yusuf Ismail", "Boitumelo Selepe", "Nicole Lewis",
        "Themba Dube", "Ashleigh September", "Siyanda Buthelezi", "Leah Wilson",
        "Dineo Makgoba", "Ryan Alexander", "Ayanda Mkhize", "Grace Davids",
    ];

    private sealed record Warehouse(string Key, string Name, string Street, string Suburb,
        string City, string Province, int PostalCode);

    private static readonly Warehouse[] Warehouses = [
        new("harbour", "Harbour Distribution Centre", "18 Dock Road", "Foreshore", "Cape Town", "Western Cape", 8001),
        new("cedar", "Cedar Logistics Hub", "42 Cedar Avenue", "Midrand", "Johannesburg", "Gauteng", 1685),
        new("summit", "Summit Supply Depot", "7 Summit Drive", "Riverhorse Valley", "Durban", "KwaZulu-Natal", 4017),
        new("highveld", "Highveld Fulfilment Centre", "26 Foundry Street", "Waltloo", "Pretoria", "Gauteng", 184),
        new("bayview", "Bayview Regional Warehouse", "11 Marine Drive", "Deal Party", "Gqeberha", "Eastern Cape", 6001),
    ];

    private sealed record Brand(string Key, string Name, string Description, string Products);

    // Six brands per warehouse, each with six distinct products. All names are fictional.
    private static readonly Brand[] Brands = [
        new("northline", "Northline", "Shipping and dispatch essentials.", "Medium shipping boxes|Large shipping boxes|Clear packing tape|Fragile labels|Bubble wrap sheets|Document pouches"),
        new("packwell", "Packwell", "Storage and protective packaging.", "Stackable storage bins|Pallet stretch wrap|Foam corner protectors|Mailing envelopes|Packing paper bundles|Corrugated dividers"),
        new("sealcraft", "Sealcraft", "Sealing solutions for secure deliveries.", "Tamper-evident bags|Security seals|Carton sealing tape|Strapping buckles|Polypropylene straps|Bag sealing clips"),
        new("cargomate", "CargoMate", "Equipment for moving goods safely.", "Platform trolleys|Pallet jacks|Ratchet tie-downs|Moving blankets|Furniture dollies|Load restraint bars"),
        new("labelworks", "Labelworks", "Labels and supplies for accurate dispatch.", "Thermal shipping labels|Barcode label sheets|Shelf label holders|Price marking labels|Label printer ribbons|Dispatch stickers"),
        new("ecowrap", "EcoWrap", "Recyclable packaging for everyday orders.", "Kraft paper rolls|Paper mailing bags|Honeycomb wrap|Compostable mailers|Recycled tissue paper|Paper packing tape"),
        new("forge", "Forge", "Reliable tools for the warehouse floor.", "Heavy-duty utility knives|Replacement blade packs|Claw hammers|Adjustable spanners|Combination pliers|Steel tape measures"),
        new("voltline", "Voltline", "Electrical supplies and workshop essentials.", "Extension leads, 10 m|Assorted cable ties|Multiplug adapters|Industrial plugs|LED work lights|Electrical insulation tape"),
        new("boltworks", "Boltworks", "Fasteners for assembly and repairs.", "Hex bolt assortment|Stainless steel nuts|Flat washer sets|Wall plug packs|Self-tapping screws|Threaded rods"),
        new("measura", "Measura", "Measuring equipment for precise work.", "Digital callipers|Spirit levels|Laser distance meters|Steel rulers|Platform scales|Measuring wheels"),
        new("griptek", "Griptek", "Hand tools built for daily maintenance.", "Screwdriver sets|Socket wrench sets|Locking pliers|Allen key sets|Bench vices|Quick-release clamps"),
        new("workbench", "Workbench", "Organisation for productive workshops.", "Portable toolboxes|Parts organisers|Magnetic tool strips|Workbench mats|Tool storage hooks|Small parts drawers"),
        new("clearway", "Clearway", "Cleaning products for busy facilities.", "Floor cleaner, 5 L|Industrial cleaning cloths|Surface sanitiser, 1 L|Glass cleaner, 750 ml|Heavy-duty degreaser|Disinfectant concentrate"),
        new("fieldwork", "Fieldwork", "Protective clothing for the whole team.", "Protective work gloves|High-visibility vests|Safety goggles|Hard hats|Ear defenders|Dust masks"),
        new("pureflow", "Pureflow", "Hygiene supplies for shared workspaces.", "Liquid hand soap, 5 L|Paper towel packs|Toilet tissue cases|Hand sanitiser, 500 ml|Soap dispensers|Refill sanitiser pouches"),
        new("sweepco", "SweepCo", "Practical floor care equipment.", "Industrial push brooms|Cotton mop heads|Mop buckets|Heavy-duty dustpans|Floor squeegees|Scrubbing brushes"),
        new("safestep", "SafeStep", "Workplace safety and spill prevention.", "Anti-slip floor mats|Wet floor signs|Spill absorbent pads|Safety barrier tape|Cable protector ramps|Emergency spill kits"),
        new("wastewise", "Wastewise", "Waste handling and recycling supplies.", "Heavy-duty refuse bags|Recycling bin liners|Wheelie bins, 120 L|Recycling sorting bins|Sharps disposal boxes|Refuse bag stands"),
        new("palletpro", "PalletPro", "Pallets and load support systems.", "Standard wooden pallets|Plastic export pallets|Pallet collars|Pallet top covers|Edge protection boards|Pallet spacer blocks"),
        new("rackline", "Rackline", "Shelving accessories for organised stock.", "Shelf support brackets|Rack beam connectors|Shelf dividers|Rack safety pins|Pallet rack guards|Wire shelf baskets"),
        new("liftwell", "Liftwell", "Lifting and handling accessories.", "Lifting slings, 2 tonne|Bow shackles|Chain sling hooks|Lifting eye bolts|Webbing sling protectors|Load indicator tags"),
        new("dockside", "Dockside", "Loading bay and vehicle essentials.", "Rubber wheel chocks|Dock bumpers|Traffic cones|Reflective bollards|Loading bay mirrors|Vehicle inspection torches"),
        new("stratum", "Stratum", "Stockroom organisation made simple.", "Picking totes|Bin label clips|Divider trays|Kanban card holders|Stock count tags|Hanging storage pockets"),
        new("thermoguard", "ThermoGuard", "Protection for temperature-sensitive goods.", "Insulated shipping liners|Reusable ice packs|Temperature indicator strips|Thermal pallet covers|Digital thermometers|Insulated transport boxes"),
        new("deskline", "Deskline", "Office essentials for daily operations.", "A4 copy paper reams|Ballpoint pen packs|Lever arch files|Stapler sets|Whiteboard markers|Clipboards"),
        new("printwell", "Printwell", "Printing supplies for busy dispatch desks.", "Black toner cartridges|Colour toner sets|Thermal receipt rolls|Printer cleaning kits|Continuous stationery|Address label sheets"),
        new("breakroom", "Breakroom", "Supplies for staff kitchens and rest areas.", "Paper cups, 250 ml|Coffee sachet boxes|Tea bag boxes|Sugar sachet packs|Wooden stirrers|Kitchen towel packs"),
        new("firstline", "Firstline", "First aid and emergency essentials.", "First aid refill kits|Adhesive dressing packs|Sterile gauze pads|Eye wash bottles|Burn dressing packs|Emergency blankets"),
        new("brightspan", "Brightspan", "Lighting and power for every workspace.", "LED tube lights|Rechargeable torches|AA battery packs|AAA battery packs|Emergency light units|Motion sensor lamps"),
        new("rainshield", "Rainshield", "Weather protection for outdoor teams.", "Waterproof jackets|Rain trouser sets|Rubber overshoes|Equipment tarpaulins|Waterproof document wallets|Reflective rain ponchos"),
    ];

    public static async Task<int> RunAsync(NpgsqlDataSource dataSource)
    {
        try
        {
            await using var connection = await dataSource.OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            // Serialize repeat invocations; existing records are never updated or reset.
            await Execute("SELECT pg_advisory_xact_lock(57307712)");
            var employees = 0;
            var warehouses = 0;
            var brands = 0;
            var items = 0;

            for (var index = 0; index < EmployeeNames.Length; index++)
            {
                var name = EmployeeNames[index];
                var email = name.ToLowerInvariant().Replace(' ', '.') + "@demo.gstock.example";
                employees += await Execute("""
                    WITH new_employee AS (
                        INSERT INTO public.employees (id, employee_id, full_name, email, account_role)
                        VALUES (@id, @number, @name, @email, CAST(@role AS public.account_role))
                        ON CONFLICT DO NOTHING RETURNING id
                    )
                    INSERT INTO public.employee_credentials (employee_id, password_hash)
                    SELECT id, @hash FROM new_employee;
                    """, ("id", Id($"employee/{index}")), ("number", $"DEMO-{index + 1:0000}"),
                    ("name", name), ("email", email),
                    ("role", index < 3 ? "Staff Manager" : index < 9 ? "Stock Manager" : "Nemployee"),
                    // Each sample account gets a different, unrecorded random password.
                    ("hash", Argon2idPasswordVerifier.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)))));
            }

            for (var index = 0; index < Warehouses.Length; index++)
            {
                var warehouse = Warehouses[index];
                var contact = EmployeeNames[index + 3];
                warehouses += await Execute("""
                    INSERT INTO public.warehouses
                        (id, name, street_name, suburb_name, city, province, postal_code, contact_name, contact_email, notes)
                    VALUES (@id, @name, @street, @suburb, @city, @province, @postal, @contact, @email, @notes)
                    ON CONFLICT (id) DO NOTHING;
                    """, ("id", Id($"warehouse/{warehouse.Key}")), ("name", warehouse.Name),
                    ("street", warehouse.Street), ("suburb", warehouse.Suburb), ("city", warehouse.City),
                    ("province", warehouse.Province), ("postal", warehouse.PostalCode), ("contact", contact),
                    ("email", contact.ToLowerInvariant().Replace(' ', '.') + "@demo.gstock.example"),
                    ("notes", "Fictional demonstration warehouse and stock, added with --seed-demo."));
            }

            for (var index = 0; index < Brands.Length; index++)
            {
                var brand = Brands[index];
                var warehouseId = Id($"warehouse/{Warehouses[index / 6].Key}");
                var brandId = Id($"brand/{brand.Key}");
                brands += await Execute("""
                    INSERT INTO public.brands (id, warehouse_id, brand_name, description)
                    SELECT @id, id, @name, @description FROM public.warehouses
                    WHERE id = @warehouse AND archived_at IS NULL
                    ON CONFLICT (id) DO NOTHING;
                    """, ("id", brandId), ("warehouse", warehouseId), ("name", brand.Name), ("description", brand.Description));

                var products = brand.Products.Split('|');
                for (var product = 0; product < products.Length; product++)
                {
                    var ordinal = index * 6 + product;
                    var quantity = ordinal % 17 == 0 ? 0 : ordinal % 7 == 0 ? 8 : 36 + ordinal * 13 % 285;
                    items += await Execute("""
                        INSERT INTO public.inventory_items
                            (id, warehouse_id, brand_id, name, sku, quantity, unit, location, reorder_level)
                        SELECT @id, b.warehouse_id, b.id, @name, @sku, @quantity, 'units', @location, 20
                        FROM public.brands b JOIN public.warehouses w ON w.id = b.warehouse_id
                        WHERE b.id = @brand AND b.archived_at IS NULL AND w.archived_at IS NULL
                        ON CONFLICT (id) DO NOTHING;
                        """, ("id", Id($"item/{brand.Key}/{product}")), ("brand", brandId), ("name", products[product]),
                        ("sku", $"DEMO-{brand.Key.ToUpperInvariant()}-{product + 1:000}"), ("quantity", quantity),
                        ("location", $"{(char)('A' + index % 6)}-{product + 1:00}-01"));
                }
            }

            await transaction.CommitAsync();
            Console.WriteLine($"Demo data added: {employees} accounts, {warehouses} warehouses, {brands} brands, {items} products.");
            Console.WriteLine("Existing data was preserved. Demo account passwords are random and are not retained.");
            return 0;

            async Task<int> Execute(string sql, params (string Name, object Value)[] parameters)
            {
                await using var command = new NpgsqlCommand(sql, connection, transaction);
                foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
                return await command.ExecuteNonQueryAsync();
            }
        }
        catch (PostgresException exception)
        {
            Console.Error.WriteLine($"Demo seed rolled back (SQLSTATE {exception.SqlState}). Apply migrations first and check for conflicting demo names or SKUs.");
            return 1;
        }
        catch (NpgsqlException)
        {
            Console.Error.WriteLine("Demo seed could not complete. Check the PostgreSQL connection; no partial seed is committed.");
            return 1;
        }
    }

    private static Guid Id(string key) => new(SHA256.HashData(Encoding.UTF8.GetBytes($"gstock/demo/v1/{key}"))[..16]);
}
