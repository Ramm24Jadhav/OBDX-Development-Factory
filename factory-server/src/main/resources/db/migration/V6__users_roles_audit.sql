-- People who use the factory. password_hash is set only for local accounts (BCrypt); LDAP and SSO users have none.
CREATE TABLE app_user (
    id            UUID PRIMARY KEY,
    username      VARCHAR(200) NOT NULL UNIQUE,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(300),
    password_hash VARCHAR(200),
    source        VARCHAR(20)  NOT NULL,
    admin         BOOLEAN      NOT NULL DEFAULT FALSE,
    enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Who may work in which workspace, and as what.
CREATE TABLE workspace_member (
    workspace_id UUID        NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role         VARCHAR(20) NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

-- Who did what, and when. Kept when workspaces or users are deleted.
CREATE TABLE audit_event (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMP WITH TIME ZONE NOT NULL,
    username     VARCHAR(200),
    action       VARCHAR(100) NOT NULL,
    workspace_id UUID,
    target       VARCHAR(500),
    detail       TEXT
);
CREATE INDEX audit_event_at_idx ON audit_event (at DESC);
CREATE INDEX audit_event_workspace_idx ON audit_event (workspace_id, at DESC);

ALTER TABLE requirement ADD COLUMN approved_by VARCHAR(200);
