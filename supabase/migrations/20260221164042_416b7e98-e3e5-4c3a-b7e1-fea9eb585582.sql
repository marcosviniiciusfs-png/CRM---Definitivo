DROP INDEX IF EXISTS public.idx_subscriptions_user_id;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);