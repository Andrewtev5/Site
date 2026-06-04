CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    image TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PLN',
    name_en TEXT NOT NULL,
    tag_en TEXT NOT NULL,
    description_en TEXT NOT NULL,
    meta_en TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    image_alt_en TEXT NOT NULL,
    name_pl TEXT NOT NULL,
    tag_pl TEXT NOT NULL,
    description_pl TEXT NOT NULL,
    meta_pl TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    image_alt_pl TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL DEFAULT 120000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_library (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    purchased_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS user_cart (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

DELETE FROM user_library
WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE products.id = user_library.product_id
);

DELETE FROM user_cart
WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE products.id = user_cart.product_id
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_library_product_id_fkey'
          AND conrelid = 'user_library'::regclass
    ) THEN
        ALTER TABLE user_library
        ADD CONSTRAINT user_library_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_cart_product_id_fkey'
          AND conrelid = 'user_cart'::regclass
    ) THEN
        ALTER TABLE user_cart
        ADD CONSTRAINT user_cart_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
END $$;

INSERT INTO products (
    id, image, price, currency,
    name_en, tag_en, description_en, meta_en, image_alt_en,
    name_pl, tag_pl, description_pl, meta_pl, image_alt_pl
) VALUES
('led-lamp-10w', 'images/lamp1.jpg', 15, 'PLN',
 'LED Lamp 10W', 'Warm light', 'Energy-efficient LED lamp for home lighting. Long lifespan and low power consumption.',
 ARRAY['Soft warm spectrum', 'Low power consumption', 'Best for bedrooms'], 'LED Lamp 10W',
 'Lampa LED 10W', 'Cieple swiatlo', 'Energooszczedna lampa LED do oswietlenia domu. Dziala dlugo i zuzywa niewiele energii.',
 ARRAY['Miekkie cieple swiatlo', 'Niski pobor mocy', 'Idealna do sypialni'], 'Lampa LED 10W'),
('smart-wifi-lamp', 'images/lamp2.jpg', 40, 'PLN',
 'Smart WiFi Lamp', 'Smart home', 'Smart lamp controlled via mobile phone. Adjust brightness and color.',
 ARRAY['App control', 'Adjustable color', 'Smart home ready'], 'Smart WiFi Lamp',
 'Lampa Smart WiFi', 'Smart home', 'Inteligentna lampa sterowana telefonem. Pozwala zmieniac jasnosc i kolor swiatla.',
 ARRAY['Sterowanie aplikacja', 'Regulacja koloru', 'Gotowa do smart home'], 'Lampa Smart WiFi'),
('minimal-table-lamp', 'images/lamp3.jpg', 32, 'PLN',
 'Minimal Table Lamp', 'Studio glow', 'Compact premium lamp with a calm golden tone. Excellent for desks, reading corners, and focused evening work.',
 ARRAY['Compact format', 'Premium finish', 'Perfect for workspaces'], 'Minimal Table Lamp',
 'Minimalistyczna lampa stolowa', 'Studyjny blask', 'Kompaktowa lampa premium o spokojnej, zlotej barwie. Swietnie sprawdza sie na biurku, w kaciku do czytania i podczas wieczornej pracy.',
 ARRAY['Kompaktowy format', 'Wykonczenie premium', 'Idealna do pracy'], 'Minimalistyczna lampa stolowa'),
('nordic-glass-lamp', 'images/lamp4.jpg', 54, 'PLN',
 'Nordic Glass Lamp', 'Premium decor', 'Elegant glass body with a decorative filament feel. Designed to become a visual accent in a living room or lounge zone.',
 ARRAY['Decorative filament', 'Premium ambiance', 'Living room accent'], 'Nordic Glass Lamp',
 'Nordycka lampa szklana', 'Dekor premium', 'Eleganckie szklane body z dekoracyjnym filamentem. Zostala zaprojektowana jako mocny akcent salonu lub strefy wypoczynku.',
 ARRAY['Dekoracyjny filament', 'Atmosfera premium', 'Akcent do salonu'], 'Nordycka lampa szklana'),
('arc-floor-lamp', 'images/ChatGPT Image 2 cze 2026, 17_10_05.png', 89, 'PLN',
 'Arc Floor Lamp', 'Reading zone', 'Tall floor lamp with a curved arm for sofas, reading corners, and soft evening lighting.',
 ARRAY['Curved metal arm', 'Floor format', 'Best near sofas'], 'Arc Floor Lamp',
 'Lampa podlogowa Arc', 'Strefa czytania', 'Wysoka lampa podlogowa z lukowym ramieniem do sofy, kacika czytania i miekkiego wieczornego swiatla.',
 ARRAY['Lukowe metalowe ramie', 'Format podlogowy', 'Najlepsza przy sofie'], 'Lampa podlogowa Arc'),
('ceramic-bedside-lamp', 'images/ChatGPT Image 2 cze 2026, 17_19_20.png', 47, 'PLN',
 'Ceramic Bedside Lamp', 'Bedroom calm', 'Small ceramic lamp with a textile shade for nightstands and calm bedroom interiors.',
 ARRAY['Ceramic base', 'Textile shade', 'Nightstand size'], 'Ceramic Bedside Lamp',
 'Ceramiczna lampa nocna', 'Spokojna sypialnia', 'Mala ceramiczna lampa z tekstylnym kloszem na szafke nocna i spokojne wnetrza sypialni.',
 ARRAY['Ceramiczna podstawa', 'Tekstylny klosz', 'Rozmiar na szafke'], 'Ceramiczna lampa nocna'),
('industrial-cage-lamp', 'images/ChatGPT Image 2 cze 2026, 17_21_32.png', 62, 'PLN',
 'Industrial Cage Lamp', 'Loft style', 'Metal cage lamp with a visible bulb for loft rooms, studios, and expressive interiors.',
 ARRAY['Metal cage shade', 'Visible bulb', 'Loft interior'], 'Industrial Cage Lamp',
 'Industrialna lampa klatkowa', 'Styl loftowy', 'Metalowa lampa z klatkowym kloszem i widoczna zarowka do loftow, studiow i wyrazistych wnetrz.',
 ARRAY['Metalowy klosz klatkowy', 'Widoczna zarowka', 'Wnetrze loftowe'], 'Industrialna lampa klatkowa'),
('wireless-mushroom-lamp', 'images/ChatGPT Image 2 cze 2026, 17_22_22.png', 58, 'PLN',
 'Wireless Mushroom Lamp', 'Portable glow', 'Rechargeable mushroom-shaped lamp for bedside tables, shelves, and cozy ambient light.',
 ARRAY['Rechargeable battery', 'Portable body', 'Ambient glow'], 'Wireless Mushroom Lamp',
 'Bezprzewodowa lampa Mushroom', 'Przenosny blask', 'Ladowalna lampa w ksztalcie grzybka na stolik nocny, polke i przytulne swiatlo dekoracyjne.',
 ARRAY['Akumulator', 'Przenosna obudowa', 'Swiatlo ambientowe'], 'Bezprzewodowa lampa Mushroom'),
('brass-reading-lamp', 'images/ChatGPT Image 2 cze 2026, 17_23_09.png', 73, 'PLN',
 'Brass Reading Lamp', 'Focused light', 'Adjustable brass lamp with directed warm light for desks, books, and evening work.',
 ARRAY['Adjustable head', 'Brass finish', 'Focused beam'], 'Brass Reading Lamp',
 'Mosiezna lampa do czytania', 'Skupione swiatlo', 'Regulowana mosiezna lampa z kierunkowym cieplym swiatlem do biurka, ksiazek i wieczornej pracy.',
 ARRAY['Regulowana glowica', 'Mosiezne wykonczenie', 'Skupiona wiazka'], 'Mosiezna lampa do czytania'),
('opal-pendant-lamp', 'images/ChatGPT Image 2 cze 2026, 17_24_21.png', 96, 'PLN',
 'Opal Pendant Lamp', 'Dining room', 'Suspended opal glass lamp that spreads balanced light over dining tables and kitchen islands.',
 ARRAY['Opal glass shade', 'Pendant mount', 'Even table light'], 'Opal Pendant Lamp',
 'Lampa wiszaca Opal', 'Jadalnia', 'Wiszaca lampa z opalowego szkla, ktora rowno rozprasza swiatlo nad stolem i wyspa kuchenna.',
 ARRAY['Klosz ze szkla opalowego', 'Mocowanie wiszace', 'Rowne swiatlo nad stolem'], 'Lampa wiszaca Opal'),
('portable-lantern-lamp', 'images/ChatGPT Image 2 cze 2026, 17_25_16.png', 51, 'PLN',
 'Portable Lantern Lamp', 'Indoor outdoor', 'Compact lantern lamp with a handle for terraces, shelves, and flexible accent lighting.',
 ARRAY['Carry handle', 'Compact lantern', 'Terrace ready'], 'Portable Lantern Lamp',
 'Przenosna lampa Lantern', 'Dom i taras', 'Kompaktowa lampa latarnia z uchwytem na taras, polke i elastyczne swiatlo akcentowe.',
 ARRAY['Uchwyt do przenoszenia', 'Kompaktowa latarnia', 'Gotowa na taras'], 'Przenosna lampa Lantern'),
('black-track-spotlight', 'images/ChatGPT Image 2 cze 2026, 17_28_07.png', 68, 'PLN',
 'Black Track Spotlight', 'Directional light', 'Modern black spotlight for highlighting shelves, pictures, and work surfaces.',
 ARRAY['Directional head', 'Modern black body', 'Accent lighting'], 'Black Track Spotlight',
 'Czarny reflektor szynowy', 'Swiatlo kierunkowe', 'Nowoczesny czarny reflektor do podkreslania polek, obrazow i powierzchni roboczych.',
 ARRAY['Kierunkowa glowica', 'Nowoczesna czarna obudowa', 'Swiatlo akcentowe'], 'Czarny reflektor szynowy'),
('rattan-table-lamp', 'images/ChatGPT Image 2 cze 2026, 17_29_47.png', 64, 'PLN',
 'Rattan Table Lamp', 'Natural texture', 'Warm table lamp with a woven rattan shade for natural, relaxed interiors.',
 ARRAY['Woven rattan', 'Warm diffusion', 'Natural style'], 'Rattan Table Lamp',
 'Rattanowa lampa stolowa', 'Naturalna faktura', 'Ciepla lampa stolowa z plecionym rattanowym kloszem do naturalnych i spokojnych wnetrz.',
 ARRAY['Pleciony rattan', 'Cieple rozproszenie', 'Naturalny styl'], 'Rattanowa lampa stolowa'),
('crystal-globe-lamp', 'images/ChatGPT Image 2 cze 2026, 17_30_38.png', 118, 'PLN',
 'Crystal Globe Lamp', 'Elegant accent', 'Decorative globe lamp with crystal detailing for premium rooms and evening atmosphere.',
 ARRAY['Crystal details', 'Globe diffuser', 'Premium accent'], 'Crystal Globe Lamp',
 'Krysztalowa lampa Globe', 'Elegancki akcent', 'Dekoracyjna lampa kulista z krysztalowym detalem do eleganckich pokoi i wieczornej atmosfery.',
 ARRAY['Krysztalowe detale', 'Kulisty dyfuzor', 'Akcent premium'], 'Krysztalowa lampa Globe'),
('kids-cloud-night-lamp', 'images/ChatGPT Image 2 cze 2026, 17_31_40.png', 39, 'PLN',
 'Kids Cloud Night Lamp', 'Night comfort', 'Soft cloud-shaped night lamp for children rooms, low brightness, and calm bedtime routines.',
 ARRAY['Soft night light', 'Child room design', 'Low brightness'], 'Kids Cloud Night Lamp',
 'Dziecieca lampka Cloud', 'Komfort nocny', 'Delikatna nocna lampka w ksztalcie chmurki do pokoju dziecka, niskiej jasnosci i spokojnego zasypiania.',
 ARRAY['Delikatne swiatlo nocne', 'Design do pokoju dziecka', 'Niska jasnosc'], 'Dziecieca lampka Cloud')
ON CONFLICT (id) DO NOTHING;
