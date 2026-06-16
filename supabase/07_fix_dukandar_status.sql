-- Fix dukandar relationships that were inserted without a status (NULL rows)
UPDATE dukandar_relationships SET status = 'active' WHERE status IS NULL;
