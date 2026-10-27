-- <<Change title>>: <<what this script adds or changes>>.
-- Started from the OBDX Development Factory template; name, folder and style as in the bank's other scripts.
-- Re-runnable: removes its own rows first. Keep a matching rollback script if the bank's scripts have them.

DELETE FROM <<table>> WHERE <<key column>> = '<<key value>>';

INSERT INTO <<table>> (<<columns>>)
VALUES (<<values>>);

COMMIT;
