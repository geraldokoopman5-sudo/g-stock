CREATE TABLE employee_credentials (
    employee_id uuid PRIMARY KEY REFERENCES employees (id) ON DELETE RESTRICT,
    password_hash text NOT NULL CHECK (password_hash ~ '[^[:space:]]'),
    password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
    remember_me boolean NOT NULL,
    created_at timestamptz NOT NULL,
    last_refreshed_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revocation_reason varchar(40),

    CONSTRAINT auth_sessions_time_order CHECK (
        created_at <= last_refreshed_at
        AND last_refreshed_at <= idle_expires_at
        AND idle_expires_at <= absolute_expires_at
    ),
    CONSTRAINT auth_sessions_known_revocation_reason CHECK (
        revocation_reason IN (
            'logout', 'logout-all', 'password-change', 'token-reuse', 'admin'
        )
    )
);

CREATE INDEX auth_sessions_employee_id_idx ON auth_sessions (employee_id);
CREATE INDEX auth_sessions_absolute_expires_at_idx ON auth_sessions (absolute_expires_at);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES auth_sessions (id) ON DELETE RESTRICT,
    token_hash char(64) COLLATE "C" NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    replaced_by_token_id uuid,

    CONSTRAINT refresh_tokens_id_session_uq UNIQUE (id, session_id),
    CONSTRAINT refresh_tokens_digest_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT refresh_tokens_valid_lifetime CHECK (created_at < expires_at),
    CONSTRAINT refresh_tokens_rotation_pair CHECK (
        (consumed_at IS NULL) = (replaced_by_token_id IS NULL)
    ),
    CONSTRAINT refresh_tokens_consumed_in_window CHECK (
        consumed_at IS NULL
        OR (created_at <= consumed_at AND consumed_at < expires_at)
    ),
    CONSTRAINT refresh_tokens_different_successor CHECK (
        replaced_by_token_id IS NULL OR replaced_by_token_id <> id
    ),
    CONSTRAINT refresh_tokens_successor_fk
        FOREIGN KEY (replaced_by_token_id, session_id)
        REFERENCES refresh_tokens (id, session_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX refresh_tokens_one_unconsumed_uq
    ON refresh_tokens (session_id)
    WHERE consumed_at IS NULL;

CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens (session_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);