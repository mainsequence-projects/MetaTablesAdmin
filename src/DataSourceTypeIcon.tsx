import { Database } from "lucide-react";
import type { ComponentType } from "react";
import postgresLogo from "./assets/data-sources/postgresql-logo.svg";
import mysqlLogo from "./assets/data-sources/mysql-logo.svg";
import mssqlLogo from "./assets/data-sources/mssql-logo.svg";
import tigerdataLogo from "./assets/data-sources/tigerdata-timescaledb-logo.png";
import sqliteLogo from "./assets/data-sources/sqlite-logo.svg";
import { sourceEngines } from "./sourceConfiguration";

const logos: Record<string, string> = {
  postgresql: postgresLogo,
  timescale_db: tigerdataLogo,
  mysql: mysqlLogo,
  mssql: mssqlLogo,
  sqlite: sqliteLogo,
};

export function sourceEngineLabel(engine: string): string {
  if (engine === "sqlite") return "SQLite";
  return sourceEngines.find(option => option.value === engine)?.label ?? engine;
}

export function DataSourceTypeIcon({ engine, className = "" }: { engine: string; className?: string }) {
  const logo = logos[engine];
  return <span className={`data-source-type-icon ${engine === "timescale_db" ? "data-source-type-icon--tigerdata" : ""} ${className}`} aria-hidden="true">
    {logo ? <img src={logo} alt="" /> : <Database size={18} />}
  </span>;
}

const PostgreSQLIcon = ({ className }: { className?: string }) => <DataSourceTypeIcon engine="postgresql" className={`${className ?? ""} data-source-type-icon--picker`} />;
const TigerDataIcon = ({ className }: { className?: string }) => <DataSourceTypeIcon engine="timescale_db" className={`${className ?? ""} data-source-type-icon--picker`} />;
const MySQLIcon = ({ className }: { className?: string }) => <DataSourceTypeIcon engine="mysql" className={`${className ?? ""} data-source-type-icon--picker`} />;
const MSSQLIcon = ({ className }: { className?: string }) => <DataSourceTypeIcon engine="mssql" className={`${className ?? ""} data-source-type-icon--picker`} />;
const SQLiteIcon = ({ className }: { className?: string }) => <DataSourceTypeIcon engine="sqlite" className={`${className ?? ""} data-source-type-icon--picker`} />;

const pickerIcons: Record<string, ComponentType<{ className?: string }>> = {
  postgresql: PostgreSQLIcon,
  timescale_db: TigerDataIcon,
  mysql: MySQLIcon,
  mssql: MSSQLIcon,
  sqlite: SQLiteIcon,
};

export function sourceEnginePickerIcon(engine: string) {
  return pickerIcons[engine];
}
