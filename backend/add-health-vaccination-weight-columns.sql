-- Add health_status, vaccination_status, and weight columns to animals table
-- Run this in Supabase SQL Editor if these columns don't exist

-- Add health_status column if it doesn't exist
ALTER TABLE animals 
ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'healthy';

-- Add vaccination_status column if it doesn't exist
ALTER TABLE animals 
ADD COLUMN IF NOT EXISTS vaccination_status TEXT DEFAULT 'unknown';

-- Add weight column if it doesn't exist
ALTER TABLE animals 
ADD COLUMN IF NOT EXISTS weight NUMERIC;

-- Update existing NULL values to defaults
UPDATE animals 
SET health_status = 'healthy' 
WHERE health_status IS NULL;

UPDATE animals 
SET vaccination_status = 'unknown' 
WHERE vaccination_status IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN animals.health_status IS 'Health status of the animal: healthy, sick, injured, pregnant';
COMMENT ON COLUMN animals.vaccination_status IS 'Vaccination status: unknown, up_to_date, due, overdue';
COMMENT ON COLUMN animals.weight IS 'Weight of the animal in kilograms';

