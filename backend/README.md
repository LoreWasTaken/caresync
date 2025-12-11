# CareSync Backend

- Express + Sequelize API served under `/api/*`.
- Auth endpoints under `/api/auth`; medications under `/api/medications`.
- SNS prescription parser proxy: `POST /api/sns/parse-pdf` (authenticated) expects multipart `file` and forwards to the FastAPI parser.

## Environment
- `PORT` (default 5000)
- `SNS_PARSER_URL` (default `http://127.0.0.1:8000/parse`) – target FastAPI parser endpoint.
- Database defaults to SQLite `database.sqlite` via `backend/src/config/database.js`.

## Run
```bash
npm install
npm run dev   # or npm start
```

Ensure the SNS FastAPI parser is running before using the proxy route.
