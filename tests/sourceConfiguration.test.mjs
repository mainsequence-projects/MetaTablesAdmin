import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceDefaults, sourceEngines, switchSourceEngine } from '../src/sourceConfiguration.ts';

test('engine changes retain identity but replace incompatible connection options', () => {
  const postgres = { ...sourceDefaults('postgresql'), host: 'db.example.test', database_name: 'analytics', database_user: 'user', password_secret_uid: 'secret-uid', tls_ca_secret_uid: 'ca-uid' };
  const mssql = switchSourceEngine(postgres, 'mssql');
  assert.equal(mssql.host, postgres.host);
  assert.equal(mssql.password_secret_uid, 'secret-uid');
  assert.equal(mssql.port, 1433);
  assert.equal(mssql.default_schema, 'dbo');
  assert.equal(mssql.encrypt, true);
  assert.equal(mssql.trust_server_certificate, false);
  assert.equal('ssl_mode' in mssql, false);
  assert.equal('tls_ca_secret_uid' in mssql, false);
  const mysql = switchSourceEngine(mssql, 'mysql');
  assert.equal(mysql.port, 3306);
  assert.equal(mysql.default_schema, 'analytics');
  assert.equal(mysql.default_charset, 'utf8mb4');
  assert.equal(mysql.ssl_mode, 'verify-full');
  assert.equal('encrypt' in mysql, false);
  assert.equal(switchSourceEngine(mysql, 'postgresql').default_schema, 'public');
  const timescale = switchSourceEngine(mysql, 'timescale_db');
  assert.equal(timescale.port, 5432);
  assert.equal(timescale.default_schema, 'public');
  assert.equal(timescale.ssl_mode, 'require');
  assert.equal('default_charset' in timescale, false);
  assert.deepEqual(sourceEngines.map(engine => engine.value), ['postgresql', 'timescale_db', 'mysql', 'mssql']);
});
