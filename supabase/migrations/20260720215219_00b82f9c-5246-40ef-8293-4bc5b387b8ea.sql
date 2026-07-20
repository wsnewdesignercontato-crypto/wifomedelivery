
-- Renames
UPDATE public.global_categories SET nome='Hamburgueria' WHERE slug='hamburguer';
UPDATE public.global_categories SET nome='Marmitaria'   WHERE slug='marmita';
UPDATE public.global_categories SET nome='Salgaderia', icone='🥟' WHERE slug='pastel';
UPDATE public.global_categories SET nome='Lanchonete'   WHERE slug='lanches';
UPDATE public.global_categories SET nome='Sorvetes'     WHERE slug='sorvete';

-- Inserts (idempotent by slug)
INSERT INTO public.global_categories (nome, slug, icone, ordem, ativo) VALUES
  ('Sushi',      'sushi',      '🍣', 100, true),
  ('Frango',     'frango',     '🍗', 101, true),
  ('Churrasco',  'churrasco',  '🍖', 102, true),
  ('Saudável',   'saudavel',   '🥗', 103, true),
  ('Mexicana',   'mexicana',   '🌮', 104, true),
  ('Massas',     'massas',     '🍝', 105, true),
  ('Padaria',    'padaria',    '🥐', 106, true),
  ('Doces',      'doces',      '🍰', 107, true),
  ('Chocolates', 'chocolates', '🍫', 108, true),
  ('Cafeteria',  'cafeteria',  '☕', 109, true),
  ('Porções',    'porcoes',    '🍟', 110, true)
ON CONFLICT (slug) DO NOTHING;

-- Reordering (final desired order)
UPDATE public.global_categories SET ordem=1  WHERE slug='hamburguer';
UPDATE public.global_categories SET ordem=2  WHERE slug='pizza';
UPDATE public.global_categories SET ordem=3  WHERE slug='sushi';
UPDATE public.global_categories SET ordem=4  WHERE slug='marmita';
UPDATE public.global_categories SET ordem=5  WHERE slug='frango';
UPDATE public.global_categories SET ordem=6  WHERE slug='churrasco';
UPDATE public.global_categories SET ordem=7  WHERE slug='saudavel';
UPDATE public.global_categories SET ordem=8  WHERE slug='mexicana';
UPDATE public.global_categories SET ordem=9  WHERE slug='massas';
UPDATE public.global_categories SET ordem=10 WHERE slug='padaria';
UPDATE public.global_categories SET ordem=11 WHERE slug='pastel';
UPDATE public.global_categories SET ordem=12 WHERE slug='lanches';
UPDATE public.global_categories SET ordem=13 WHERE slug='doces';
UPDATE public.global_categories SET ordem=14 WHERE slug='chocolates';
UPDATE public.global_categories SET ordem=15 WHERE slug='sorvete';
UPDATE public.global_categories SET ordem=16 WHERE slug='acai';
UPDATE public.global_categories SET ordem=17 WHERE slug='bebidas';
UPDATE public.global_categories SET ordem=18 WHERE slug='cafeteria';
UPDATE public.global_categories SET ordem=19 WHERE slug='porcoes';
UPDATE public.global_categories SET ordem=20 WHERE slug='mercado';
UPDATE public.global_categories SET ordem=21 WHERE slug='farmacia';
