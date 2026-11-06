-- The whole JUnit report of a Jenkins build (every case with its suite and result), its line coverage and its archived
-- images, so Validation can show the tests by suite, the coverage gate and the screenshots as evidence.
ALTER TABLE change_build ADD COLUMN report JSONB;
ALTER TABLE change_build ADD COLUMN coverage DOUBLE PRECISION;
ALTER TABLE change_build ADD COLUMN images JSONB;
