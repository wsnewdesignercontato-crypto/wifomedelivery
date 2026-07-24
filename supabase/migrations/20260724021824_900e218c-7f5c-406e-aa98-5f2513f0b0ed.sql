ALTER TABLE public.courier_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.establishments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.establishments;