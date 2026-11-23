-- One Postgres server, one database per service. Each service creates its own tables on start-up.
CREATE DATABASE users;
CREATE DATABASE orders;
