-- Aumentar a precisão da coluna valor na tabela leads para suportar valores maiores
-- De numeric(10,2) para numeric(15,2) permite até R$ 9.999.999.999.999,99
ALTER TABLE leads 
ALTER COLUMN valor TYPE numeric(15,2);