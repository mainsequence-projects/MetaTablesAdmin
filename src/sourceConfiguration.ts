export type SourceEngine = "postgresql" | "timescale_db" | "mysql" | "mssql";
export type SourceConfiguration = {
  host: string; port: number; database_name: string; database_user: string;
  default_schema: string; password_secret_uid: string | null;
  ssl_mode?: string; default_charset?: string;
  tls_ca_secret_uid?: string | null; tls_certificate_secret_uid?: string | null;
  tls_key_secret_uid?: string | null; encrypt?: boolean; trust_server_certificate?: boolean;
};

export const sourceEngines: { value: SourceEngine; label: string }[] = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "timescale_db", label: "TimescaleDB" },
  { value: "mysql", label: "MySQL" },
  { value: "mssql", label: "Microsoft SQL Server (MSSQL)" },
];

export function sourceDefaults(engine: SourceEngine): SourceConfiguration {
  const common = { host: "", database_name: "", database_user: "", password_secret_uid: null };
  if (engine === "mssql") return { ...common, port: 1433, default_schema: "dbo", encrypt: true, trust_server_certificate: false };
  if (engine === "mysql") return { ...common, port: 3306, default_schema: "", ssl_mode: "verify-full", default_charset: "utf8mb4" };
  return { ...common, port: 5432, default_schema: "public", ssl_mode: "require" };
}

export function switchSourceEngine(previous: SourceConfiguration, engine: SourceEngine): SourceConfiguration {
  // Keep identity inputs, but do not send another engine's TLS/options to the API.
  return {
    ...sourceDefaults(engine), host: previous.host, database_name: previous.database_name,
    database_user: previous.database_user, password_secret_uid: previous.password_secret_uid,
    ...(engine === "mysql" ? { default_schema: previous.database_name } : {}),
  };
}
