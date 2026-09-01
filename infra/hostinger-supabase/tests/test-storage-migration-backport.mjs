import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const kitDirectory = path.resolve(testDirectory, '..')
const migrationDirectory = path.join(kitDirectory, 'sql', 'storage-migrations')

const officialMigrations = [
  {
    file: '0061-mark-filename-immutable.sql',
    gitBlobSha1: '473f19ac94419f9cd3f25f2e40c97cefafb2798d',
    sha256: '7e1f854f81d3775e338ecfed200c30711d2c38e304ac372ca580864f940f2f5a',
    trackingSha1: 'fe0096517ae9d60aaec1d110172ba9036dc66bb7',
  },
  {
    file: '0062-object-versioning-core.sql',
    gitBlobSha1: '76cf3f7f0f26d37d257c32ebb90f5beeb5a32a1e',
    sha256: '45969060b55102f56af317b0d7981434be58927de1ff76e1e1789139a3f2defc',
    trackingSha1: '0b855f00ff3be0bfca91efee02a9858912491a9a',
  },
  {
    file: '0063-fix-search-name-relative-to-prefix.sql',
    gitBlobSha1: '11c38a5896f22a2a2b6a588abbbc43306f5b8867',
    sha256: '4656900fd7953a821f45802baa85b83456a7334a0923fd53dee6c886cccf69b3',
    trackingSha1: 'c7485e417624f795ce8bb2da21927f48e088904d',
  },
  {
    file: '0064-fix-search-by-timestamp-sqli.sql',
    gitBlobSha1: 'e3689e05ac48d366b85b1d7133b631616edd90b9',
    sha256: '4351d651632bb62841d75f0a85ea8b23b62e141a53fd08d0426ce60f44672d20',
    trackingSha1: '0af424ecd388a39bb1645184b222185a12149675',
  },
]

test('official Storage migration bytes and native tracking hashes are pinned', async () => {
  const attributes = await readFile(path.join(migrationDirectory, '.gitattributes'), 'utf8')
  assert.match(attributes, /^\*\.sql text eol=lf$/m)
  assert.match(attributes, /^SHA256SUMS text eol=lf$/m)

  for (const migration of officialMigrations) {
    const bytes = await readFile(path.join(migrationDirectory, migration.file))
    assert.equal(bytes.includes(13), false, `${migration.file} must use LF only`)
    assert.equal(bytes.at(-1), 10, `${migration.file} must end with LF`)
    assert.equal(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`, 'utf8')
        .update(bytes)
        .digest('hex'),
      migration.gitBlobSha1,
    )
    assert.equal(createHash('sha256').update(bytes).digest('hex'), migration.sha256)
    assert.equal(
      createHash('sha1').update(migration.file, 'utf8').update(bytes).digest('hex'),
      migration.trackingSha1,
    )
  }
})

test('restore verifies and applies the exact sequence atomically', async () => {
  const restore = await readFile(
    path.join(kitDirectory, 'scripts', '04-restore-target.sh'),
    'utf8',
  )

  assert.match(restore, /sha256sum --check --strict "\$STORAGE_MIGRATIONS_MANIFEST"/)
  assert.match(restore, /--single-transaction -v ON_ERROR_STOP=1 --file=-/)
  assert.match(restore, /die 'ponte transacional de Auth\/Storage falhou e foi revertida'/)

  const migrationListMatch = restore.match(/storage_migration_files=\(\r?\n([\s\S]*?)\r?\n\)/)
  assert.ok(migrationListMatch, 'ordered Storage migration list is missing')
  let migrationPosition = -1
  for (const migration of officialMigrations) {
    const position = migrationListMatch[1].indexOf(migration.file)
    assert.ok(position > migrationPosition, `${migration.file} is out of order`)
    migrationPosition = position
  }

  const bundleMatch = restore.match(/service_schema_bundle=\(\r?\n([\s\S]*?)\r?\n\)/)
  assert.ok(bundleMatch, 'service schema bundle is missing')
  const bundle = bundleMatch[1]
  let previousPosition = bundle.indexOf('"$SERVICE_SCHEMA_COMPATIBILITY_SQL"')
  assert.notEqual(previousPosition, -1)
  const migrationsPosition = bundle.indexOf('"${storage_migration_files[@]}"')
  assert.ok(migrationsPosition > previousPosition, 'official migrations must follow the prelude')
  previousPosition = migrationsPosition
  const validationPosition = bundle.indexOf('"$STORAGE_MIGRATION_VALIDATION_SQL"')
  assert.ok(validationPosition > previousPosition, 'validation must run after migration 64')
})

test('database guard records exact history and includes behavior checks', async () => {
  const validation = await readFile(
    path.join(kitDirectory, 'sql', 'record-and-validate-storage-migrations.sql'),
    'utf8',
  )

  for (const migration of officialMigrations) {
    assert.match(validation, new RegExp(migration.trackingSha1))
  }
  assert.match(validation, /id = 60/)
  assert.match(validation, /id > 64/)
  assert.match(validation, /SAVEPOINT crm_storage_backport_behavior;/)
  assert.match(validation, /ROLLBACK TO SAVEPOINT crm_storage_backport_behavior;/)
  assert.match(validation, /desc nulls last; select pg_sleep\(30\); --/)
  assert.match(validation, /updated_at\) desc; select pg_sleep\(30\); --/)

  const targetValidation = await readFile(
    path.join(kitDirectory, 'sql', 'target-validation.sql'),
    'utf8',
  )
  assert.match(targetValidation, /_crm_storage_schema_health/)
  assert.match(targetValidation, /storage_schema_migration_64_not_verified/)
  for (const migration of officialMigrations) {
    assert.match(targetValidation, new RegExp(migration.trackingSha1))
  }

  const healthcheck = await readFile(
    path.join(kitDirectory, 'scripts', '10-healthcheck.sh'),
    'utf8',
  )
  assert.match(healthcheck, /schema do Storage divergiu das migrations oficiais 61-64/)
  for (const migration of officialMigrations) {
    assert.match(healthcheck, new RegExp(migration.trackingSha1))
  }
})

test('local compatibility prelude relies on the outer transaction', async () => {
  const prelude = await readFile(
    path.join(kitDirectory, 'sql', 'prepare-service-schema-compatibility.sql'),
    'utf8',
  )

  assert.doesNotMatch(prelude, /^\s*BEGIN\s*;/im)
  assert.doesNotMatch(prelude, /^\s*COMMIT\s*;/im)
  assert.doesNotMatch(prelude, /ADD COLUMN IF NOT EXISTS versioning_status/)
  assert.match(prelude, /custom_claims_allowlist/)
})
