-- Stand-in for pgvector in the factory's trial database, which has no pgvector (there is no Windows build of it).
-- It covers what the factory uses: the vector type in pgvector's text form ([1,2,3]), vector_dims and the <=> cosine
-- distance. Without a vector index each search compares all embeddings, which is fine for trial-sized codebases.

CREATE DOMAIN vector AS text CHECK (VALUE ~ '^\[.*\]$');

CREATE FUNCTION vector_to_float8(v vector) RETURNS float8[]
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT string_to_array(btrim(v::text, '[] '), ',')::float8[] $$;

CREATE FUNCTION vector_dims(v vector) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT cardinality(vector_to_float8(v)) $$;

CREATE FUNCTION cosine_distance(a vector, b vector) RETURNS float8
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
        SELECT 1 - sum(x * y) / nullif(sqrt(sum(x * x)) * sqrt(sum(y * y)), 0)
        FROM unnest(vector_to_float8(a), vector_to_float8(b)) AS t(x, y)
    $$;

CREATE OPERATOR <=> (LEFTARG = vector, RIGHTARG = vector, FUNCTION = cosine_distance, COMMUTATOR = <=>);
