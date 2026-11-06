-- What a chat model's server takes, learned when it refused a request (a free plan's per-minute limits), kept over
-- restarts so the first request after one is not refused again. Cleared when the server or model changes.
CREATE TABLE model_limits (
    base_url        VARCHAR(1000)    NOT NULL,
    model           VARCHAR(300)     NOT NULL,
    input_tokens    INTEGER          NOT NULL DEFAULT 0,
    chars_per_token DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    output_tokens   INTEGER          NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (base_url, model)
);
