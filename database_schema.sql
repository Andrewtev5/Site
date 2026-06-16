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
 'Lampa LED 10W', 'Ciepłe światło', 'Energooszczędna lampa LED do oświetlenia domu. Działa długo i zużywa niewiele energii.',
 ARRAY['Miękkie ciepłe światło', 'Niski pobór mocy', 'Idealna do sypialni'], 'Lampa LED 10W'),
('smart-wifi-lamp', 'images/lamp2.jpg', 40, 'PLN',
 'Smart WiFi Lamp', 'Smart home', 'Smart lamp controlled via mobile phone. Adjust brightness and color.',
 ARRAY['App control', 'Adjustable color', 'Smart home ready'], 'Smart WiFi Lamp',
 'Lampa Smart WiFi', 'Smart home', 'Inteligentna lampa sterowana telefonem. Pozwala zmieniać jasność i kolor światła.',
 ARRAY['Sterowanie aplikacją', 'Regulacja koloru', 'Gotowa do smart home'], 'Lampa Smart WiFi'),
('minimal-table-lamp', 'images/lamp3.jpg', 32, 'PLN',
 'Minimal Table Lamp', 'Studio glow', 'Compact premium lamp with a calm golden tone. Excellent for desks, reading corners, and focused evening work.',
 ARRAY['Compact format', 'Premium finish', 'Perfect for workspaces'], 'Minimal Table Lamp',
 'Minimalistyczna lampa stołowa', 'Studyjny blask', 'Kompaktowa lampa premium o spokojnej, złotej barwie. Świetnie sprawdza się na biurku, w kąciku do czytania i podczas wieczornej pracy.',
 ARRAY['Kompaktowy format', 'Wykończenie premium', 'Idealna do pracy'], 'Minimalistyczna lampa stołowa'),
('nordic-glass-lamp', 'images/lamp4.jpg', 54, 'PLN',
 'Nordic Glass Lamp', 'Premium decor', 'Elegant glass body with a decorative filament feel. Designed to become a visual accent in a living room or lounge zone.',
 ARRAY['Decorative filament', 'Premium ambiance', 'Living room accent'], 'Nordic Glass Lamp',
 'Nordycka lampa szklana', 'Dekor premium', 'Elegancki szklany korpus z dekoracyjnym filamentem. Został zaprojektowany jako mocny akcent salonu lub strefy wypoczynku.',
 ARRAY['Dekoracyjny filament', 'Atmosfera premium', 'Akcent do salonu'], 'Nordycka lampa szklana'),
('arc-floor-lamp', 'images/ChatGPT Image 2 cze 2026, 17_10_05.png', 89, 'PLN',
 'Arc Floor Lamp', 'Reading zone', 'Tall floor lamp with a curved arm for sofas, reading corners, and soft evening lighting.',
 ARRAY['Curved metal arm', 'Floor format', 'Best near sofas'], 'Arc Floor Lamp',
 'Lampa podłogowa Arc', 'Strefa czytania', 'Wysoka lampa podłogowa z łukowym ramieniem do sofy, kącika czytania i miękkiego wieczornego swiatla.',
 ARRAY['Łukowe metalowe ramię', 'Format podłogowy', 'Najlepsza przy sofie'], 'Lampa podłogowa Arc'),
('ceramic-bedside-lamp', 'images/ChatGPT Image 2 cze 2026, 17_19_20.png', 47, 'PLN',
 'Ceramic Bedside Lamp', 'Bedroom calm', 'Small ceramic lamp with a textile shade for nightstands and calm bedroom interiors.',
 ARRAY['Ceramic base', 'Textile shade', 'Nightstand size'], 'Ceramic Bedside Lamp',
 'Ceramiczna lampa nocna', 'Spokojna sypialnia', 'Mała ceramiczna lampa z tekstylnym kloszem na szafkę nocną i spokojne wnętrza sypialni.',
 ARRAY['Ceramiczna podstawa', 'Tekstylny klosz', 'Rozmiar na szafkę'], 'Ceramiczna lampa nocna'),
('industrial-cage-lamp', 'images/ChatGPT Image 2 cze 2026, 17_21_32.png', 62, 'PLN',
 'Industrial Cage Lamp', 'Loft style', 'Metal cage lamp with a visible bulb for loft rooms, studios, and expressive interiors.',
 ARRAY['Metal cage shade', 'Visible bulb', 'Loft interior'], 'Industrial Cage Lamp',
 'Industrialna lampa klatkowa', 'Styl loftowy', 'Metalowa lampa z klatkowym kloszem i widoczną żarówką do loftów, studiów i wyrazistych wnętrz.',
 ARRAY['Metalowy klosz klatkowy', 'Widoczna żarówka', 'Wnętrze loftowe'], 'Industrialna lampa klatkowa'),
('wireless-mushroom-lamp', 'images/ChatGPT Image 2 cze 2026, 17_22_22.png', 58, 'PLN',
 'Wireless Mushroom Lamp', 'Portable glow', 'Rechargeable mushroom-shaped lamp for bedside tables, shelves, and cozy ambient light.',
 ARRAY['Rechargeable battery', 'Portable body', 'Ambient glow'], 'Wireless Mushroom Lamp',
 'Bezprzewodowa lampa Mushroom', 'Przenośny blask', 'Ładowalna lampa w kształcie grzybka na stolik nocny, półkę i przytulne światło dekoracyjne.',
 ARRAY['Akumulator', 'Przenośna obudowa', 'Światło ambientowe'], 'Bezprzewodowa lampa Mushroom'),
('brass-reading-lamp', 'images/ChatGPT Image 2 cze 2026, 17_23_09.png', 73, 'PLN',
 'Brass Reading Lamp', 'Focused light', 'Adjustable brass lamp with directed warm light for desks, books, and evening work.',
 ARRAY['Adjustable head', 'Brass finish', 'Focused beam'], 'Brass Reading Lamp',
 'Mosiężna lampa do czytania', 'Skupione światło', 'Regulowana mosiężna lampa z kierunkowym ciepłym światłem do biurka, książek i wieczornej pracy.',
 ARRAY['Regulowana głowica', 'Mosiężne wykończenie', 'Skupiona wiązka'], 'Mosiężna lampa do czytania'),
('opal-pendant-lamp', 'images/ChatGPT Image 2 cze 2026, 17_24_21.png', 96, 'PLN',
 'Opal Pendant Lamp', 'Dining room', 'Suspended opal glass lamp that spreads balanced light over dining tables and kitchen islands.',
 ARRAY['Opal glass shade', 'Pendant mount', 'Even table light'], 'Opal Pendant Lamp',
 'Lampa wisząca Opal', 'Jadalnia', 'Wisząca lampa z opalowego szkła, która równomiernie rozprasza światło nad stołem i wyspą kuchenną.',
 ARRAY['Klosz ze szkła opalowego', 'Mocowanie wiszące', 'Równe światło nad stołem'], 'Lampa wisząca Opal'),
('portable-lantern-lamp', 'images/ChatGPT Image 2 cze 2026, 17_25_16.png', 51, 'PLN',
 'Portable Lantern Lamp', 'Indoor outdoor', 'Compact lantern lamp with a handle for terraces, shelves, and flexible accent lighting.',
 ARRAY['Carry handle', 'Compact lantern', 'Terrace ready'], 'Portable Lantern Lamp',
 'Przenośna lampa Lantern', 'Dom i taras', 'Kompaktowa lampa latarnia z uchwytem na taras, półkę i elastyczne światło akcentowe.',
 ARRAY['Uchwyt do przenoszenia', 'Kompaktowa latarnia', 'Gotowa na taras'], 'Przenośna lampa Lantern'),
('black-track-spotlight', 'images/ChatGPT Image 2 cze 2026, 17_28_07.png', 68, 'PLN',
 'Black Track Spotlight', 'Directional light', 'Modern black spotlight for highlighting shelves, pictures, and work surfaces.',
 ARRAY['Directional head', 'Modern black body', 'Accent lighting'], 'Black Track Spotlight',
 'Czarny reflektor szynowy', 'Światło kierunkowe', 'Nowoczesny czarny reflektor do podkreślania półek, obrazów i powierzchni roboczych.',
 ARRAY['Kierunkowa głowica', 'Nowoczesna czarna obudowa', 'Światło akcentowe'], 'Czarny reflektor szynowy'),
('rattan-table-lamp', 'images/ChatGPT Image 2 cze 2026, 17_29_47.png', 64, 'PLN',
 'Rattan Table Lamp', 'Natural texture', 'Warm table lamp with a woven rattan shade for natural, relaxed interiors.',
 ARRAY['Woven rattan', 'Warm diffusion', 'Natural style'], 'Rattan Table Lamp',
 'Rattanowa lampa stołowa', 'Naturalna faktura', 'Ciepła lampa stołowa z plecionym rattanowym kloszem do naturalnych i spokojnych wnętrz.',
 ARRAY['Pleciony rattan', 'Ciepłe rozproszenie', 'Naturalny styl'], 'Rattanowa lampa stołowa'),
('crystal-globe-lamp', 'images/ChatGPT Image 2 cze 2026, 17_30_38.png', 118, 'PLN',
 'Crystal Globe Lamp', 'Elegant accent', 'Decorative globe lamp with crystal detailing for premium rooms and evening atmosphere.',
 ARRAY['Crystal details', 'Globe diffuser', 'Premium accent'], 'Crystal Globe Lamp',
 'Kryształowa lampa Globe', 'Elegancki akcent', 'Dekoracyjna lampa kulista z kryształowym detalem do eleganckich pokoi i wieczornej atmosfery.',
 ARRAY['Kryształowe detale', 'Kulisty dyfuzor', 'Akcent premium'], 'Kryształowa lampa Globe'),
('kids-cloud-night-lamp', 'images/ChatGPT Image 2 cze 2026, 17_31_40.png', 39, 'PLN',
 'Kids Cloud Night Lamp', 'Night comfort', 'Soft cloud-shaped night lamp for children rooms, low brightness, and calm bedtime routines.',
 ARRAY['Soft night light', 'Child room design', 'Low brightness'], 'Kids Cloud Night Lamp',
 'Dziecięca lampka Cloud', 'Komfort nocny', 'Delikatna nocna lampka w kształcie chmurki do pokoju dziecka, niskiej jasności i spokojnego zasypiania.',
 ARRAY['Delikatne światło nocne', 'Design do pokoju dziecka', 'Niska jasność'], 'Dziecięca lampka Cloud')
ON CONFLICT (id) DO NOTHING;
