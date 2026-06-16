-- Add email column to customers table
-- Run this in Supabase → SQL Editor
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR;
