-- =====================================================
-- KAIROZ CRM - DATABASE BACKUP DUMP
-- Generated: 2026-01-02
-- PostgreSQL Compatible SQL Dump
-- =====================================================

-- Disable foreign key checks during import
SET session_replication_role = 'replica';

-- =====================================================
-- ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('super_admin', 'admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLE: organizations
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name, created_at, updated_at) VALUES
('a79b1484-af5e-4ac6-91c1-be59d509798b', 'mateusabc21@gmail.com''s Organization', '2025-11-14 19:02:29.720324+00', '2025-11-14 19:02:29.720324+00'),
('d1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'Marcos''s Organization', '2025-11-19 20:16:30.840931+00', '2025-11-19 20:16:30.840931+00'),
('2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'mateusabcck@gmail.com''s Organization', '2025-11-20 14:14:23.373448+00', '2025-11-20 14:14:23.373448+00'),
('66119f2a-81dd-48e8-8b13-0d898945608c', 'Pyke''s Organization', '2025-11-21 14:14:42.437648+00', '2025-11-21 14:14:42.437648+00'),
('c4b66d60-7d92-4b59-a62a-6256b434a66d', 'Marata''s Organization', '2025-11-24 21:45:11.799262+00', '2025-11-24 21:45:11.799262+00'),
('ad1e0f6a-5a0c-4591-921f-142bfe7d73fe', 'Marcos Hurtz''s Organization', '2025-11-26 14:37:18.505301+00', '2025-11-26 14:37:18.505301+00'),
('704a5652-1d95-4b92-8d1d-04b1bfa73c92', 'Info''s Organization', '2025-11-30 16:27:45.31629+00', '2025-11-30 16:27:45.31629+00'),
('e3e3edcd-289f-434a-bbaf-42488c2a1e3b', 'Kerlys Kauan Costa Alves''s Organization', '2025-11-30 17:21:32.257628+00', '2025-11-30 17:21:32.257628+00'),
('6dd00f7b-3670-40a3-993b-339ab8b8c3da', 'Tata''s Organization', '2025-12-05 00:36:52.622824+00', '2025-12-05 00:36:52.622824+00'),
('b578471f-d196-4d50-afda-163b3333060c', 'Daniela Silva ''s Organization', '2025-12-09 17:58:38.325484+00', '2025-12-09 17:58:38.325484+00'),
('94e2ca7a-699d-4612-ad63-a078a44f1793', 'Victor''s Organization', '2025-12-09 21:34:55.429605+00', '2025-12-09 21:34:55.429605+00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at;

-- =====================================================
-- TABLE: profiles
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    job_title TEXT,
    notification_sound_enabled BOOLEAN DEFAULT true,
    button_click_sound_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO profiles (id, user_id, full_name, avatar_url, job_title, notification_sound_enabled, button_click_sound_enabled, created_at, updated_at) VALUES
('3af30ac6-150c-4929-bb41-06a91da18b3d', '96e68316-68a9-4f6c-bf2f-e5cb48ddae10', 'Batata', NULL, NULL, true, true, '2025-11-16 23:28:42.775445+00', '2025-11-16 23:28:42.775445+00'),
('3db40c8c-8ee7-4ed1-a8e4-ba9da567edb8', '5d23b55e-aaed-4ebf-8120-f4341bda56a0', 'Brito', NULL, NULL, true, true, '2025-11-16 23:28:42.775445+00', '2025-11-16 23:28:42.775445+00'),
('a6cf97ac-d22a-4551-811e-3cdf83553681', '45b35983-bb9a-4c35-a527-31cdca012a5f', 'Marcos', NULL, NULL, true, true, '2025-11-16 23:28:42.775445+00', '2025-11-16 23:28:42.775445+00'),
('c27c6025-5a74-4f7e-8871-a5e6468743df', 'f672e74c-07a7-4bd5-9a80-dfc00630d6f8', 'mateusabc20@gmail.com', NULL, NULL, true, true, '2025-11-16 23:28:42.775445+00', '2025-11-16 23:28:42.775445+00'),
('10988232-7e47-4013-badf-adc835cb81a1', '9b51c26d-a785-4ab8-bc31-f6af80277bd5', 'Britinho', NULL, '', true, true, '2025-11-16 23:28:42.775445+00', '2025-11-16 23:29:54.9983+00'),
('c31f8807-0f15-4a2c-8401-eddc68e9b59a', '41d0c7bb-db11-4663-ade1-dc307d20b243', 'Mateus Brito', 'https://uvwanpztskkhzdqifbai.supabase.co/storage/v1/object/public/avatars/41d0c7bb-db11-4663-ade1-dc307d20b243/1763651082247.jpg', NULL, true, true, '2025-11-16 23:28:42.775445+00', '2025-11-20 15:04:45.244122+00'),
('673df24a-7589-4c84-b616-b20195e67220', 'f4e81cff-47a9-46eb-8eb4-ef47910dbfe9', 'Pyke', NULL, NULL, true, true, '2025-11-21 14:14:42.437648+00', '2025-11-21 14:14:42.437648+00'),
('b4941fcb-fcc0-4f99-a803-ca31f8882ec6', 'bae698c3-2b7b-4c1b-b9eb-f1c56808bf05', 'Vinicius', NULL, 'marcos01@gmail.com', true, true, '2025-11-21 14:25:26.67628+00', '2025-11-21 14:28:23.241092+00'),
('240a6e12-f5e2-41db-8f0d-778c518a530d', 'd464e068-d720-4852-ab7d-8e29d40e1174', 'Marata', NULL, NULL, true, true, '2025-11-24 21:45:11.799262+00', '2025-11-24 21:45:11.799262+00'),
('f65c775b-9e81-4b77-a560-ac52e994322d', '3f98213b-4590-46a5-8e15-0fcdca3b0118', 'Marcos', 'https://uvwanpztskkhzdqifbai.supabase.co/storage/v1/object/public/avatars/3f98213b-4590-46a5-8e15-0fcdca3b0118/1764156828624.jpg', '', true, true, '2025-11-19 20:16:30.840931+00', '2025-11-26 11:33:58.830188+00'),
('13856ec1-948b-4bf4-9db5-e5204b668b44', '630afe05-f61d-40db-a738-a33ec63f0c61', 'Marcos Hurtz', NULL, NULL, true, true, '2025-11-26 14:37:18.505301+00', '2025-11-26 14:37:18.505301+00'),
('788167ce-2eee-4142-88a0-46d90dfeb936', 'e7fef480-d6fa-4c69-847d-7ef440e92583', 'Batata', NULL, NULL, true, true, '2025-11-28 20:07:29.097507+00', '2025-11-28 20:07:29.097507+00'),
('e2f6086d-c424-47c6-9ac8-54c31d212aee', 'a2929c13-23b3-4ae6-b0c2-d4e519ea2de1', 'Batata01', NULL, NULL, true, true, '2025-11-28 20:07:57.52489+00', '2025-11-28 20:07:57.52489+00'),
('d71e4d73-f2c3-4254-89a1-225766561933', 'c8a34deb-5443-4ff2-b4a1-12106e85fcd6', 'Info', NULL, NULL, true, true, '2025-11-30 16:27:45.31629+00', '2025-11-30 16:27:45.31629+00'),
('09c47c1d-f749-4c21-9622-d27163994d24', '62f8a79c-f9a0-45ea-9233-ce9cf8b09293', 'Kerlys Kauan Costa Alves', NULL, NULL, true, true, '2025-11-30 17:21:32.257628+00', '2025-11-30 17:21:32.257628+00'),
('3479065c-b27a-48e8-b631-8fdebd1e8ead', '5ac3ef6e-dfe9-49cb-9dcb-c08aff9dc531', 'Tata', NULL, NULL, true, true, '2025-12-05 00:36:52.622824+00', '2025-12-05 00:36:52.622824+00')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, avatar_url = EXCLUDED.avatar_url, updated_at = EXCLUDED.updated_at;

-- =====================================================
-- TABLE: organization_members
-- =====================================================

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    email TEXT,
    role organization_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organization_members (id, organization_id, user_id, email, role, created_at) VALUES
('9cb3807c-e454-4e64-a343-6dff57799921', 'a79b1484-af5e-4ac6-91c1-be59d509798b', '9b51c26d-a785-4ab8-bc31-f6af80277bd5', 'mateusabc21@gmail.com', 'owner', '2025-11-14 19:02:29.720324+00'),
('35ccc9cd-fb22-4421-b3cd-a126bb78f973', 'a79b1484-af5e-4ac6-91c1-be59d509798b', '45b35983-bb9a-4c35-a527-31cdca012a5f', 'marcos@gmail.com', 'member', '2025-11-15 19:51:56.440549+00'),
('17d1edbd-6431-470a-b93f-12020889d6e9', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', '3f98213b-4590-46a5-8e15-0fcdca3b0118', 'marcosviniicius.fs@gmail.com', 'owner', '2025-11-19 20:16:30.840931+00'),
('9c144f99-60ed-46d5-8b53-9e57dd70a69c', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', '41d0c7bb-db11-4663-ade1-dc307d20b243', 'mateusabcck@gmail.com', 'owner', '2025-11-20 14:14:23.373448+00'),
('15de4706-e706-4ded-9464-dd8655c96857', '66119f2a-81dd-48e8-8b13-0d898945608c', 'f4e81cff-47a9-46eb-8eb4-ef47910dbfe9', 'marcosviniciusferreiradesa901@gmail.com', 'owner', '2025-11-21 14:14:42.437648+00'),
('7b3d33bc-53c4-48e0-8eed-4095515a7580', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'f4e81cff-47a9-46eb-8eb4-ef47910dbfe9', 'marcosviniciusferreiradesa901@gmail.com', 'member', '2025-11-21 14:14:42.691744+00'),
('f13ce173-8f03-481a-9e6f-7964e9983544', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'bae698c3-2b7b-4c1b-b9eb-f1c56808bf05', 'marcos01@gmail.com', 'member', '2025-11-21 14:25:26.307194+00'),
('5901df93-fe81-4acd-b613-5027ff34ece7', 'c4b66d60-7d92-4b59-a62a-6256b434a66d', 'd464e068-d720-4852-ab7d-8e29d40e1174', 'marata@gmail.com', 'owner', '2025-11-24 21:45:11.799262+00'),
('b39857f9-9e22-4de6-93c1-a3633f52024a', 'ad1e0f6a-5a0c-4591-921f-142bfe7d73fe', '630afe05-f61d-40db-a738-a33ec63f0c61', 'marcoshurtz17@gmail.com', 'owner', '2025-11-26 14:37:18.505301+00'),
('f018785c-79be-40fc-8c78-863d51f42300', '704a5652-1d95-4b92-8d1d-04b1bfa73c92', 'c8a34deb-5443-4ff2-b4a1-12106e85fcd6', 'infoprod1git4l@gmail.com', 'owner', '2025-11-30 16:27:45.31629+00'),
('278d1aa5-671d-4f10-8dce-5d19a1c98227', 'e3e3edcd-289f-434a-bbaf-42488c2a1e3b', '62f8a79c-f9a0-45ea-9233-ce9cf8b09293', 'kerlyskauan@gmail.com', 'owner', '2025-11-30 17:21:32.257628+00'),
('6f921e8f-d7eb-4589-a063-807ef951b5b3', '6dd00f7b-3670-40a3-993b-339ab8b8c3da', '5ac3ef6e-dfe9-49cb-9dcb-c08aff9dc531', 'tatata@gmail.com', 'owner', '2025-12-05 00:36:52.622824+00'),
('05d81ed9-83ec-4e4b-b17d-076c7eccd03b', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'af8412ab-7c40-4f02-86bd-4b1342ddf467', 'teste01@gmail.com', 'member', '2025-12-07 20:57:08.019898+00'),
('fb9ecc69-cfcb-4ded-beba-9615c67bc89e', 'b578471f-d196-4d50-afda-163b3333060c', '6a37a6d6-6e69-4dc9-a746-5e0f062841ab', 'daniicristini@gmail.com', 'owner', '2025-12-09 17:58:38.325484+00'),
('f7e347f1-9633-4784-ba04-11d4455b6f2a', '94e2ca7a-699d-4612-ad63-a078a44f1793', 'c3b14637-8b70-40f1-82c2-6c01ab391a5a', 'victor@gmail.com', 'owner', '2025-12-09 21:34:55.429605+00'),
('7834a5c7-4b21-43e9-88ca-1edd40ab8758', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', '071d44c7-9b1b-44c4-b4e5-87f6779bc2a1', 'vinicius01@gmail.com', 'member', '2025-12-11 01:25:30.009979+00'),
('d78e674e-aa71-4fa5-a087-6913fa6a45b9', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', '9d504a40-823c-4936-ba33-720895fb30fa', 'gilmarsilva@gmail.com', 'member', '2025-12-11 01:26:13.942065+00'),
('34113b7e-d370-4577-ae18-6f17bb6ce402', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'ca4cfc69-31bf-4957-9793-6593313677c2', 'camila@gmail.com', 'member', '2025-12-11 01:28:59.414167+00')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

-- =====================================================
-- TABLE: sales_funnels
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    icon_color TEXT DEFAULT '#4CA698',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sales_funnels (id, organization_id, name, description, icon, icon_color, is_default, is_active, created_at, updated_at) VALUES
('fbbecc59-c843-433c-93ce-539499cc9df7', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'Funil de Vendas', 'Funil padrão de vendas', NULL, '#4CA698', true, true, '2025-11-28 22:17:08.669729+00', '2025-11-28 22:17:08.669729+00'),
('30955a2d-e23c-4d33-b5b9-86da17eeb25a', 'a79b1484-af5e-4ac6-91c1-be59d509798b', 'Funil Padrão', 'Funil padrão do sistema', NULL, '#4CA698', true, true, '2025-11-28 22:36:00.323066+00', '2025-11-28 22:36:00.323066+00'),
('06f5d198-e372-495a-a504-89adf49c35df', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'Funil Padrão', 'Funil padrão do sistema', NULL, '#4CA698', true, true, '2025-11-28 22:36:00.323066+00', '2025-11-28 22:36:00.323066+00'),
('a05250e1-22b7-4136-ad2f-01bb5923b966', '66119f2a-81dd-48e8-8b13-0d898945608c', 'Funil Padrão', 'Funil padrão do sistema', NULL, '#4CA698', true, true, '2025-11-28 22:36:00.323066+00', '2025-11-28 22:36:00.323066+00'),
('79966c94-4b3a-4ddb-b736-67589ca3014d', 'c4b66d60-7d92-4b59-a62a-6256b434a66d', 'Funil Padrão', 'Funil padrão do sistema', NULL, '#4CA698', true, true, '2025-11-28 22:36:00.323066+00', '2025-11-28 22:36:00.323066+00'),
('162d8964-08ab-4da1-b120-17c35f5827ed', 'ad1e0f6a-5a0c-4591-921f-142bfe7d73fe', 'Funil Padrão', 'Funil padrão do sistema', NULL, '#4CA698', true, true, '2025-11-28 22:36:00.323066+00', '2025-11-28 22:36:00.323066+00'),
('0e095ee4-4ea8-44a0-a96a-6014b6887c26', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'SDR', '', 'headphones', '#4CA698', false, true, '2025-11-30 20:16:16.136351+00', '2025-12-02 02:23:56.303495+00'),
('f3a1c40e-ef10-4e5a-bbc8-d0a0276f43c7', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'Comercial', '', 'target', '#EF4444', false, true, '2025-11-28 22:43:14.158984+00', '2025-12-02 02:24:02.296814+00'),
('abe19d9a-d0e0-48a3-8bc0-a178fa7f2958', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'Teste 02', '', 'briefcase', '#4CA698', false, true, '2025-12-07 18:13:24.358552+00', '2025-12-07 18:13:24.358552+00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at;

-- =====================================================
-- TABLE: teams
-- =====================================================

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    avatar_url TEXT,
    leader_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO teams (id, organization_id, name, description, color, avatar_url, leader_id, created_at, updated_at) VALUES
('3ab2b155-996d-4a84-86f0-b93e5f9bf321', 'd1e0b2bb-8f1a-4abf-a721-daa430c40c32', 'Equipe Phoenix', NULL, '#EF4444', 'https://uvwanpztskkhzdqifbai.supabase.co/storage/v1/object/public/team-avatars/d1e0b2bb-8f1a-4abf-a721-daa430c40c32/5de2b913-9217-421f-969d-f65085a9a23e.jpeg', '3f98213b-4590-46a5-8e15-0fcdca3b0118', '2025-12-07 19:00:30.217987+00', '2025-12-07 19:00:46.475301+00'),
('0152bd39-8622-40f5-b356-4a97eaa663ff', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'Lobo', NULL, '#3B82F6', 'https://uvwanpztskkhzdqifbai.supabase.co/storage/v1/object/public/team-avatars/2309ce52-a0be-4298-b65c-1bc48a4bba8f/443ad633-85e3-49be-be34-079f45ed77c7.png', '41d0c7bb-db11-4663-ade1-dc307d20b243', '2025-12-08 17:30:44.653313+00', '2025-12-11 11:38:16.076943+00'),
('937f9aac-c912-4edc-ae16-3f70912ac506', '2309ce52-a0be-4298-b65c-1bc48a4bba8f', 'Phonix', NULL, '#EF4444', 'https://uvwanpztskkhzdqifbai.supabase.co/storage/v1/object/public/team-avatars/2309ce52-a0be-4298-b65c-1bc48a4bba8f/b17c2aa8-ec8f-4f28-820f-15c3c2889635.png', '41d0c7bb-db11-4663-ade1-dc307d20b243', '2025-12-03 03:03:20.86279+00', '2025-12-11 11:38:31.380165+00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = EXCLUDED.updated_at;

-- =====================================================
-- TABLE: team_members
-- =====================================================

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES
('ee2af572-d399-49bf-8276-04def6c45246', '3ab2b155-996d-4a84-86f0-b93e5f9bf321', '3f98213b-4590-46a5-8e15-0fcdca3b0118', 'leader', '2025-12-07 19:00:47.029129+00'),
('a166dd7f-ccae-4218-8c21-9b9b7c5c8b4b', '3ab2b155-996d-4a84-86f0-b93e5f9bf321', 'bae698c3-2b7b-4c1b-b9eb-f1c56808bf05', 'member', '2025-12-07 19:00:47.029129+00'),
('ea5ca4f5-33a2-40c7-954a-3c565b420816', '3ab2b155-996d-4a84-86f0-b93e5f9bf321', 'f4e81cff-47a9-46eb-8eb4-ef47910dbfe9', 'member', '2025-12-07 19:00:47.029129+00'),
('12a86b0d-e2b7-4f35-95f9-d64e639e6bfc', '0152bd39-8622-40f5-b356-4a97eaa663ff', '41d0c7bb-db11-4663-ade1-dc307d20b243', 'leader', '2025-12-11 11:38:16.585186+00'),
('3e8f659e-04bb-401c-a54f-4e1a19396128', '0152bd39-8622-40f5-b356-4a97eaa663ff', 'a2929c13-23b3-4ae6-b0c2-d4e519ea2de1', 'member', '2025-12-11 11:38:16.585186+00'),
('56f8bcc9-cee8-4b1d-a461-2ac9c7562929', '0152bd39-8622-40f5-b356-4a97eaa663ff', 'af8412ab-7c40-4f02-86bd-4b1342ddf467', 'member', '2025-12-11 11:38:16.585186+00'),
('92b15c18-09ce-4bd3-8320-a7949cc08d25', '0152bd39-8622-40f5-b356-4a97eaa663ff', 'ca4cfc69-31bf-4957-9793-6593313677c2', 'member', '2025-12-11 11:38:16.585186+00'),
('d6cfb262-cdc4-4fa3-a7e0-c6f9774f6772', '937f9aac-c912-4edc-ae16-3f70912ac506', '071d44c7-9b1b-44c4-b4e5-87f6779bc2a1', 'member', '2025-12-11 11:38:31.885525+00'),
('0cd641fe-c839-4799-b580-8168791543e3', '937f9aac-c912-4edc-ae16-3f70912ac506', '41d0c7bb-db11-4663-ade1-dc307d20b243', 'leader', '2025-12-11 11:38:31.885525+00'),
('c037189d-0c19-4df5-aff4-65773ac37713', '937f9aac-c912-4edc-ae16-3f70912ac506', '9d504a40-823c-4936-ba33-720895fb30fa', 'member', '2025-12-11 11:38:31.885525+00'),
('ce4177e6-d158-47db-953d-c1843f2f6f44', '937f9aac-c912-4edc-ae16-3f70912ac506', 'a2929c13-23b3-4ae6-b0c2-d4e519ea2de1', 'member', '2025-12-11 11:38:31.885525+00')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

-- =====================================================
-- Re-enable foreign key checks
-- =====================================================

SET session_replication_role = 'origin';

-- =====================================================
-- END OF BACKUP
-- =====================================================

-- NOTES:
-- 1. This backup contains core structure tables only
-- 2. For complete data (leads, messages, etc.) use the Edge Function: export-database-backup
-- 3. Tables included: organizations, profiles, organization_members, sales_funnels, teams, team_members
-- 4. To restore: psql -d your_database -f DATABASE_BACKUP_2026-01-02.sql
-- 5. For MySQL: Convert TIMESTAMPTZ to DATETIME, UUID to VARCHAR(36), BOOLEAN to TINYINT(1)
