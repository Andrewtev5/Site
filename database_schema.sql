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
 ARRAY['Dekoracyjny filament', 'Atmosfera premium', 'Akcent do salonu'], 'Nordycka lampa szklana')
ON CONFLICT (id) DO NOTHING;
