#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const DISCARDED_BUCKET_ID = 'chat-media'

const HELP = `
Migra buckets e objetos entre dois projetos Supabase Storage.

Uso:
  node infra/hostinger-supabase/scripts/copy-storage.mjs [opcoes]

Opcoes:
  --verify          Copia e verifica ao final (padrao).
  --no-verify       Copia sem a verificacao final.
  --verify-only     Nao altera o destino; compara origem e destino.
  -h, --help        Exibe esta ajuda.

Variaveis obrigatorias:
  SOURCE_SUPABASE_URL
  SOURCE_SERVICE_ROLE_KEY
  TARGET_SUPABASE_URL
  TARGET_SERVICE_ROLE_KEY

Variaveis opcionais:
  STORAGE_DRY_RUN=true|false             Planeja sem alterar ou baixar objetos (padrao: false).
  STORAGE_BUCKETS=id1,id2                Restringe a IDs de buckets da origem.
  STORAGE_CONCURRENCY=1..12              Transferencias simultaneas (padrao: 3).
  STORAGE_PAGE_SIZE=1..1000              Itens por pagina de listagem (padrao: 1000).
  STORAGE_MAX_RETRIES=0..10              Repeticoes para falhas transitorias (padrao: 4).
  STORAGE_RETRY_BASE_MS=100..30000       Base do backoff exponencial (padrao: 500).
  STORAGE_PROGRESS_EVERY=1..100000       Intervalo do progresso (padrao: 100 objetos).
  STORAGE_VERIFY=true|false              Habilita verificacao apos a copia (padrao: true).
  STORAGE_VERIFY_ONLY=true|false         Equivalente a --verify-only (padrao: false).
  STORAGE_ALLOW_EXTRA_TARGET=true|false  Nao falha por objetos extras no destino (padrao: false).

Comportamento:
  - nunca copia chat-media; esse bucket aprovado como descartavel precisa
    existir vazio no destino e e recusado se aparecer em STORAGE_BUCKETS;
  - cria ou atualiza buckets preservando public, fileSizeLimit e allowedMimeTypes;
  - percorre pastas recursivamente e pagina cada pasta;
  - sobrescreve o mesmo path no destino (upsert), permitindo reexecucao;
  - preserva Content-Type e o max-age de Cache-Control quando expostos pela API;
  - verifica configuracao, conjunto de paths e tamanhos. Metadados sao comparados
    quando a listagem os fornece nos dois lados;
  - retorna codigo diferente de zero se houver falhas de copia ou verificacao.

Observacao: a API de upload nao preserva owner/owner_id, IDs, ETags ou timestamps
dos objetos. Se politicas RLS dependerem de ownership, trate isso separadamente.
`.trim()

class UsageError extends Error {}

let runtimeSensitiveValues = []

function parseArguments(argv) {
  let help = false
  let verifyOverride
  let verifyOnlyOverride

  for (const argument of argv) {
    switch (argument) {
      case '-h':
      case '--help':
        help = true
        break
      case '--verify':
        if (verifyOverride === false) {
          throw new UsageError('Nao combine --verify com --no-verify.')
        }
        verifyOverride = true
        break
      case '--no-verify':
        if (verifyOverride === true) {
          throw new UsageError('Nao combine --verify com --no-verify.')
        }
        verifyOverride = false
        break
      case '--verify-only':
        verifyOnlyOverride = true
        break
      default:
        throw new UsageError(`Opcao desconhecida: ${argument}`)
    }
  }

  if (verifyOnlyOverride && verifyOverride === false) {
    throw new UsageError('Nao combine --verify-only com --no-verify.')
  }

  return { help, verifyOverride, verifyOnlyOverride }
}

function requireEnvironment(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new UsageError(`Variavel obrigatoria ausente: ${name}`)
  }
  if (value !== value.trim()) {
    throw new UsageError(`${name} possui espacos no inicio ou no fim.`)
  }
  if (/\s/.test(value)) {
    throw new UsageError(`${name} nao pode conter espacos ou quebras de linha.`)
  }
  return value
}

function parseBooleanEnvironment(name, defaultValue) {
  const value = process.env[name]
  if (value === undefined || value === '') return defaultValue

  const normalized = value.toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  throw new UsageError(`${name} deve ser true ou false.`)
}

function parseIntegerEnvironment(name, defaultValue, minimum, maximum) {
  const value = process.env[name]
  if (value === undefined || value === '') return defaultValue
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`${name} deve ser um numero inteiro entre ${minimum} e ${maximum}.`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new UsageError(`${name} deve estar entre ${minimum} e ${maximum}.`)
  }
  return parsed
}

function parseSupabaseUrl(name) {
  const rawValue = requireEnvironment(name)
  let parsed
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new UsageError(`${name} nao e uma URL valida.`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UsageError(`${name} deve usar http:// ou https://.`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new UsageError(`${name} nao pode conter credenciais, query string ou fragmento.`)
  }
  if (!parsed.hostname) {
    throw new UsageError(`${name} precisa conter um host.`)
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  return parsed.toString().replace(/\/$/, '')
}

function parseServiceRoleKey(name) {
  const value = requireEnvironment(name)
  if (value.length < 20) {
    throw new UsageError(`${name} parece curta demais para uma service-role key.`)
  }
  return value
}

function parseBucketFilter() {
  const rawValue = process.env.STORAGE_BUCKETS
  if (rawValue === undefined || rawValue === '') return null

  const values = rawValue.split(',').map((value) => value.trim())
  if (values.some((value) => value.length === 0)) {
    throw new UsageError('STORAGE_BUCKETS contem um ID vazio.')
  }
  if (values.some((value) => /[\u0000-\u001f\u007f]/.test(value))) {
    throw new UsageError('STORAGE_BUCKETS contem caracteres de controle.')
  }
  return [...new Set(values)]
}

function buildConfiguration(argumentsResult) {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
    throw new UsageError(`Node.js >= 20 e obrigatorio; versao atual: ${process.versions.node}.`)
  }

  const sourceUrl = parseSupabaseUrl('SOURCE_SUPABASE_URL')
  const sourceKey = parseServiceRoleKey('SOURCE_SERVICE_ROLE_KEY')
  const targetUrl = parseSupabaseUrl('TARGET_SUPABASE_URL')
  const targetKey = parseServiceRoleKey('TARGET_SERVICE_ROLE_KEY')

  if (sourceUrl.toLowerCase() === targetUrl.toLowerCase()) {
    throw new UsageError('Origem e destino apontam para a mesma URL; operacao recusada.')
  }

  const verifyFromEnvironment = parseBooleanEnvironment('STORAGE_VERIFY', true)
  const verifyOnlyFromEnvironment = parseBooleanEnvironment('STORAGE_VERIFY_ONLY', false)
  const verifyOnly = argumentsResult.verifyOnlyOverride ?? verifyOnlyFromEnvironment
  const verify = verifyOnly
    ? true
    : (argumentsResult.verifyOverride ?? verifyFromEnvironment)

  const bucketFilter = parseBucketFilter()
  if (bucketFilter?.includes(DISCARDED_BUCKET_ID)) {
    throw new UsageError(
      'chat-media e descartavel e nunca pode ser copiado; remova-o de STORAGE_BUCKETS.',
    )
  }

  return {
    sourceUrl,
    sourceKey,
    targetUrl,
    targetKey,
    dryRun: parseBooleanEnvironment('STORAGE_DRY_RUN', false),
    bucketFilter,
    concurrency: parseIntegerEnvironment('STORAGE_CONCURRENCY', 3, 1, 12),
    pageSize: parseIntegerEnvironment('STORAGE_PAGE_SIZE', 1000, 1, 1000),
    maxRetries: parseIntegerEnvironment('STORAGE_MAX_RETRIES', 4, 0, 10),
    retryBaseMs: parseIntegerEnvironment('STORAGE_RETRY_BASE_MS', 500, 100, 30000),
    progressEvery: parseIntegerEnvironment('STORAGE_PROGRESS_EVERY', 100, 1, 100000),
    verify,
    verifyOnly,
    allowExtraTarget: parseBooleanEnvironment('STORAGE_ALLOW_EXTRA_TARGET', false),
  }
}

function createStorageClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function errorStatus(error) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.cause?.statusCode,
    error?.cause?.status,
  ]
  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) return parsed
  }
  return null
}

function isRetryable(error) {
  const status = errorStatus(error)
  if (status !== null) {
    return status === 408 || status === 425 || status === 429 || status >= 500
  }

  const code = String(error?.code ?? error?.cause?.code ?? '').toUpperCase()
  if (['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'ETIMEDOUT'].includes(code)) {
    return true
  }
  if (error?.name === 'AbortError' || error instanceof TypeError) return true

  // Erros sem status geralmente sao de transporte ou de parse de uma resposta transitoria.
  return true
}

function redact(text, sensitiveValues = []) {
  let result = String(text ?? 'erro sem mensagem')
  for (const value of sensitiveValues) {
    if (value) result = result.split(value).join('[SEGREDO OMITIDO]')
  }
  result = result
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL OMITIDA]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN OMITIDO]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '?')
  return result.length > 500 ? `${result.slice(0, 497)}...` : result
}

function safeError(error, sensitiveValues) {
  const message = error?.message ?? error?.error ?? error
  const status = errorStatus(error)
  return `${redact(message, sensitiveValues)}${status === null ? '' : ` (HTTP ${status})`}`
}

async function withRetry(context, configuration, sensitiveValues, operation) {
  let lastError
  const attempts = configuration.maxRetries + 1

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryable(error)) throw error

      const exponential = Math.min(30000, configuration.retryBaseMs * (2 ** (attempt - 1)))
      const waitMilliseconds = Math.round(exponential * (0.8 + Math.random() * 0.4))
      console.warn(
        `Aviso: ${context} falhou; tentativa ${attempt + 1}/${attempts} em ` +
        `${waitMilliseconds} ms: ${safeError(error, sensitiveValues)}`,
      )
      await sleep(waitMilliseconds)
    }
  }

  throw lastError
}

async function callApi(context, configuration, sensitiveValues, operation) {
  return withRetry(context, configuration, sensitiveValues, async () => {
    const response = await operation()
    if (!response || typeof response !== 'object' || !('error' in response)) {
      throw new Error('Resposta inesperada do SDK Supabase.')
    }
    if (response.error) throw response.error
    return response.data
  })
}

function displayName(value) {
  return JSON.stringify(String(value))
}

function normalizeStringArray(value) {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null
  return [...value].map(String).sort((left, right) => left.localeCompare(right))
}

function bucketOptions(bucket) {
  return {
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit ?? bucket.fileSizeLimit ?? null,
    allowedMimeTypes: normalizeStringArray(
      bucket.allowed_mime_types ?? bucket.allowedMimeTypes ?? null,
    ),
  }
}

function bucketConfigurationsMatch(sourceBucket, targetBucket) {
  if (!targetBucket) return false
  const source = bucketOptions(sourceBucket)
  const target = bucketOptions(targetBucket)
  return source.public === target.public
    && String(source.fileSizeLimit ?? '') === String(target.fileSizeLimit ?? '')
    && JSON.stringify(source.allowedMimeTypes) === JSON.stringify(target.allowedMimeTypes)
}

async function listAllBuckets(client, side, configuration, sensitiveValues) {
  const buckets = new Map()
  const limit = Math.min(configuration.pageSize, 1000)
  let offset = 0

  while (true) {
    const page = await callApi(
      `listar buckets da ${side}`,
      configuration,
      sensitiveValues,
      () => client.storage.listBuckets({
        limit,
        offset,
        sortColumn: 'id',
        sortOrder: 'asc',
      }),
    )

    if (!Array.isArray(page)) {
      throw new Error(`A listagem de buckets da ${side} nao retornou uma lista.`)
    }

    let newItems = 0
    for (const bucket of page) {
      if (!bucket || typeof bucket.id !== 'string' || bucket.id.length === 0) {
        throw new Error(`A listagem de buckets da ${side} retornou um bucket sem ID valido.`)
      }
      if (!buckets.has(bucket.id)) newItems += 1
      buckets.set(bucket.id, bucket)
    }

    if (page.length < limit) break
    if (newItems === 0) {
      throw new Error(`A paginacao de buckets da ${side} nao avancou.`)
    }
    offset += page.length
  }

  return [...buckets.values()]
}

function isFolderEntry(item) {
  return (item?.id === null || item?.id === undefined) && item?.metadata == null
}

function validObjectSegment(name) {
  return typeof name === 'string'
    && name.length > 0
    && name !== '.'
    && name !== '..'
    && !name.includes('/')
    && !/[\u0000-\u001f\u007f]/.test(name)
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null) return object[key]
  }
  return null
}

function objectSize(item) {
  const metadata = item?.metadata
  const value = firstDefined(item, ['size'])
    ?? firstDefined(metadata, ['size', 'contentLength', 'content_length'])
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function cleanContentType(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 255 || /[\r\n]/.test(trimmed)) return null
  return trimmed
}

function objectContentType(item) {
  return cleanContentType(
    firstDefined(item, ['contentType', 'content_type'])
      ?? firstDefined(item?.metadata, ['mimetype', 'mimeType', 'contentType', 'content_type']),
  )
}

function normalizeCacheControl(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(Math.floor(value))
  }
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  const match = /(?:^|[,;\s])max-age\s*=\s*"?(\d+)"?/i.exec(trimmed)
  return match ? match[1] : null
}

function objectCacheControl(item) {
  return normalizeCacheControl(
    firstDefined(item, ['cacheControl', 'cache_control'])
      ?? firstDefined(item?.metadata, ['cacheControl', 'cache_control']),
  )
}

function objectDescriptor(path, item) {
  return {
    path,
    size: objectSize(item),
    contentType: objectContentType(item),
    cacheControl: objectCacheControl(item),
  }
}

async function listAllObjects(client, bucketId, side, configuration, sensitiveValues) {
  const storage = client.storage.from(bucketId)
  const pendingPrefixes = ['']
  const visitedPrefixes = new Set()
  const objects = new Map()

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.pop()
    if (visitedPrefixes.has(prefix)) continue
    visitedPrefixes.add(prefix)

    let offset = 0
    const seenNames = new Set()
    while (true) {
      const page = await callApi(
        `listar ${side}, bucket ${displayName(bucketId)}, pasta ${displayName(prefix || '/')}`,
        configuration,
        sensitiveValues,
        () => storage.list(prefix, {
          limit: configuration.pageSize,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      )

      if (!Array.isArray(page)) {
        throw new Error(`A listagem de objetos do bucket ${displayName(bucketId)} nao retornou uma lista.`)
      }

      let newItems = 0
      for (const item of page) {
        if (!validObjectSegment(item?.name)) {
          throw new Error(
            `Entrada invalida retornada no bucket ${displayName(bucketId)}, pasta ${displayName(prefix || '/')}.`,
          )
        }
        if (seenNames.has(item.name)) continue
        seenNames.add(item.name)
        newItems += 1

        const path = prefix ? `${prefix}/${item.name}` : item.name
        if (isFolderEntry(item)) {
          pendingPrefixes.push(path)
        } else {
          if (objects.has(path)) {
            throw new Error(`Path duplicado na listagem do bucket ${displayName(bucketId)}: ${displayName(path)}.`)
          }
          objects.set(path, objectDescriptor(path, item))
        }
      }

      if (page.length < configuration.pageSize) break
      if (newItems === 0) {
        throw new Error(
          `A paginacao nao avancou no bucket ${displayName(bucketId)}, pasta ${displayName(prefix || '/')}.`,
        )
      }
      offset += page.length
    }
  }

  return [...objects.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function sumKnownBytes(objects) {
  let bytes = 0
  let unknown = 0
  for (const object of objects) {
    if (object.size === null) unknown += 1
    else bytes += object.size
  }
  return { bytes, unknown }
}

function newBucketSummary(bucketId) {
  return {
    bucket: bucketId,
    objectsFound: 0,
    sourceBytes: 0,
    unknownSizes: 0,
    planned: 0,
    attempted: 0,
    copied: 0,
    copiedBytes: 0,
    copyFailures: 0,
    bucketFailures: 0,
    metadataWarnings: 0,
    verified: 0,
    verificationFailures: 0,
    missing: 0,
    extra: 0,
    mismatched: 0,
    metadataUnverified: 0,
  }
}

async function ensureTargetBucket(
  sourceBucket,
  targetBucket,
  targetClient,
  configuration,
  sensitiveValues,
  summary,
) {
  const id = sourceBucket.id
  const options = bucketOptions(sourceBucket)
  const action = targetBucket ? 'atualizar' : 'criar'
  const needsChange = !bucketConfigurationsMatch(sourceBucket, targetBucket)

  if (!needsChange) {
    console.log(`Bucket ${displayName(id)}: configuracao ja corresponde a origem.`)
    return true
  }

  if (configuration.dryRun) {
    console.log(`[dry-run] Bucket ${displayName(id)}: ${action} com a configuracao da origem.`)
    return true
  }

  try {
    if (targetBucket) {
      await callApi(
        `atualizar bucket ${displayName(id)}`,
        configuration,
        sensitiveValues,
        () => targetClient.storage.updateBucket(id, options),
      )
    } else {
      await callApi(
        `criar bucket ${displayName(id)}`,
        configuration,
        sensitiveValues,
        () => targetClient.storage.createBucket(id, options),
      )
    }
    console.log(`Bucket ${displayName(id)}: configuracao aplicada no destino.`)
    return true
  } catch (error) {
    summary.bucketFailures += 1
    console.error(
      `Falha ao ${action} bucket ${displayName(id)}: ${safeError(error, sensitiveValues)}`,
    )
    // Um bucket existente ainda pode receber objetos mesmo se a atualizacao de configuracao falhar.
    return Boolean(targetBucket)
  }
}

async function enrichDescriptorFromInfo(storage, descriptor, configuration, sensitiveValues, summary) {
  if (descriptor.contentType && descriptor.cacheControl !== null) return descriptor
  if (typeof storage.info !== 'function') {
    summary.metadataWarnings += 1
    return descriptor
  }

  try {
    const info = await callApi(
      `ler metadados de ${displayName(descriptor.path)}`,
      configuration,
      sensitiveValues,
      () => storage.info(descriptor.path),
    )
    return {
      ...descriptor,
      size: descriptor.size ?? objectSize(info),
      contentType: descriptor.contentType ?? objectContentType(info),
      cacheControl: descriptor.cacheControl ?? objectCacheControl(info),
    }
  } catch (error) {
    summary.metadataWarnings += 1
    if (summary.metadataWarnings <= 20) {
      console.warn(
        `Aviso: metadados opcionais indisponiveis para ${displayName(descriptor.path)}: ` +
        safeError(error, sensitiveValues),
      )
    } else if (summary.metadataWarnings === 21) {
      console.warn('Aviso: outros avisos de metadados serao omitidos deste log.')
    }
    return descriptor
  }
}

async function copyOneObject(
  sourceStorage,
  targetStorage,
  descriptor,
  configuration,
  sensitiveValues,
  summary,
) {
  const enriched = await enrichDescriptorFromInfo(
    sourceStorage,
    descriptor,
    configuration,
    sensitiveValues,
    summary,
  )

  const blob = await callApi(
    `baixar objeto ${displayName(descriptor.path)}`,
    configuration,
    sensitiveValues,
    () => sourceStorage.download(descriptor.path),
  )
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('O download nao retornou um Blob valido.')
  }

  const payload = new Uint8Array(await blob.arrayBuffer())
  const contentType = enriched.contentType ?? cleanContentType(blob.type) ?? 'application/octet-stream'
  const uploadOptions = { upsert: true, contentType }
  if (enriched.cacheControl !== null) uploadOptions.cacheControl = enriched.cacheControl

  await callApi(
    `enviar objeto ${displayName(descriptor.path)}`,
    configuration,
    sensitiveValues,
    () => targetStorage.upload(descriptor.path, payload, uploadOptions),
  )

  return payload.byteLength
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) return
        await worker(items[index], index)
      }
    },
  )
  await Promise.all(workers)
}

async function copyBucketObjects(
  sourceClient,
  targetClient,
  bucketId,
  objects,
  configuration,
  sensitiveValues,
  summary,
) {
  const sourceStorage = sourceClient.storage.from(bucketId)
  const targetStorage = targetClient.storage.from(bucketId)

  await runPool(objects, configuration.concurrency, async (descriptor) => {
    summary.attempted += 1
    try {
      const bytes = await copyOneObject(
        sourceStorage,
        targetStorage,
        descriptor,
        configuration,
        sensitiveValues,
        summary,
      )
      summary.copied += 1
      summary.copiedBytes += bytes
    } catch (error) {
      summary.copyFailures += 1
      console.error(
        `Falha no bucket ${displayName(bucketId)}, objeto ${displayName(descriptor.path)}: ` +
        safeError(error, sensitiveValues),
      )
    }

    if (
      summary.attempted % configuration.progressEvery === 0
      || summary.attempted === objects.length
    ) {
      console.log(
        `Bucket ${displayName(bucketId)}: ${summary.attempted}/${objects.length} processados, ` +
        `${summary.copied} copiados, ${summary.copyFailures} falhas.`,
      )
    }
  })
}

function normalizedContentType(value) {
  return cleanContentType(value)?.toLowerCase() ?? null
}

function verificationDifferences(sourceObject, targetObject, summary) {
  const differences = []

  if (sourceObject.size !== null && targetObject.size !== null && sourceObject.size !== targetObject.size) {
    differences.push(`tamanho ${sourceObject.size} != ${targetObject.size}`)
  }

  const sourceContentType = normalizedContentType(sourceObject.contentType)
  const targetContentType = normalizedContentType(targetObject.contentType)
  if (sourceContentType && targetContentType) {
    if (sourceContentType !== targetContentType) differences.push('Content-Type diferente')
  } else if (sourceContentType || targetContentType) {
    summary.metadataUnverified += 1
  }

  const sourceCacheControl = normalizeCacheControl(sourceObject.cacheControl)
  const targetCacheControl = normalizeCacheControl(targetObject.cacheControl)
  if (sourceCacheControl !== null && targetCacheControl !== null) {
    if (sourceCacheControl !== targetCacheControl) differences.push('Cache-Control diferente')
  } else if (sourceCacheControl !== null || targetCacheControl !== null) {
    summary.metadataUnverified += 1
  }

  return differences
}

function reportVerificationIssue(summary, message) {
  summary.verificationFailures += 1
  if (summary.verificationFailures <= 20) {
    console.error(`Verificacao: ${message}`)
  } else if (summary.verificationFailures === 21) {
    console.error('Verificacao: outras divergencias serao omitidas deste log.')
  }
}

async function fetchBucket(client, side, bucketId, configuration, sensitiveValues) {
  try {
    return await callApi(
      `consultar bucket ${displayName(bucketId)} na ${side}`,
      configuration,
      sensitiveValues,
      () => client.storage.getBucket(bucketId),
    )
  } catch (error) {
    if (errorStatus(error) === 404) return null
    throw error
  }
}

async function verifyBucket(
  sourceClient,
  targetClient,
  sourceBucketFallback,
  configuration,
  sensitiveValues,
  summary,
) {
  const bucketId = sourceBucketFallback.id
  console.log(`Bucket ${displayName(bucketId)}: iniciando verificacao.`)

  let sourceBucket = sourceBucketFallback
  let targetBucket
  try {
    sourceBucket = await fetchBucket(
      sourceClient,
      'origem',
      bucketId,
      configuration,
      sensitiveValues,
    ) ?? sourceBucketFallback
    targetBucket = await fetchBucket(
      targetClient,
      'destino',
      bucketId,
      configuration,
      sensitiveValues,
    )
  } catch (error) {
    reportVerificationIssue(
      summary,
      `nao foi possivel consultar a configuracao de ${displayName(bucketId)}: ` +
      safeError(error, sensitiveValues),
    )
    return
  }

  if (!targetBucket) {
    reportVerificationIssue(summary, `bucket ausente no destino: ${displayName(bucketId)}.`)
  } else if (!bucketConfigurationsMatch(sourceBucket, targetBucket)) {
    reportVerificationIssue(summary, `configuracao divergente no bucket ${displayName(bucketId)}.`)
  }

  let sourceObjects
  try {
    sourceObjects = await listAllObjects(
      sourceClient,
      bucketId,
      'origem durante verificacao',
      configuration,
      sensitiveValues,
    )
  } catch (error) {
    reportVerificationIssue(
      summary,
      `nao foi possivel listar a origem de ${displayName(bucketId)}: ${safeError(error, sensitiveValues)}`,
    )
    return
  }

  if (!targetBucket) {
    summary.missing += sourceObjects.length
    for (const sourceObject of sourceObjects) {
      reportVerificationIssue(summary, `objeto ausente: ${displayName(`${bucketId}/${sourceObject.path}`)}.`)
    }
    return
  }

  let targetObjects
  try {
    targetObjects = await listAllObjects(
      targetClient,
      bucketId,
      'destino durante verificacao',
      configuration,
      sensitiveValues,
    )
  } catch (error) {
    reportVerificationIssue(
      summary,
      `nao foi possivel listar o destino de ${displayName(bucketId)}: ${safeError(error, sensitiveValues)}`,
    )
    return
  }

  const targetByPath = new Map(targetObjects.map((object) => [object.path, object]))
  const sourcePaths = new Set()

  for (const sourceObject of sourceObjects) {
    sourcePaths.add(sourceObject.path)
    const targetObject = targetByPath.get(sourceObject.path)
    if (!targetObject) {
      summary.missing += 1
      reportVerificationIssue(
        summary,
        `objeto ausente: ${displayName(`${bucketId}/${sourceObject.path}`)}.`,
      )
      continue
    }

    const differences = verificationDifferences(sourceObject, targetObject, summary)
    if (differences.length > 0) {
      summary.mismatched += 1
      reportVerificationIssue(
        summary,
        `${displayName(`${bucketId}/${sourceObject.path}`)}: ${differences.join(', ')}.`,
      )
    } else {
      summary.verified += 1
    }
  }

  for (const targetObject of targetObjects) {
    if (sourcePaths.has(targetObject.path)) continue
    summary.extra += 1
    if (!configuration.allowExtraTarget) {
      reportVerificationIssue(
        summary,
        `objeto extra no destino: ${displayName(`${bucketId}/${targetObject.path}`)}.`,
      )
    }
  }

  console.log(
    `Bucket ${displayName(bucketId)}: ${summary.verified} verificados, ` +
    `${summary.missing} ausentes, ${summary.mismatched} divergentes, ${summary.extra} extras.`,
  )
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '?'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}

function printSummary(summaries, globalFailures, configuration) {
  const rows = summaries.map((summary) => ({
    bucket: summary.bucket,
    objetos: summary.objectsFound,
    bytes_origem: `${formatBytes(summary.sourceBytes)}${summary.unknownSizes ? ' + ?' : ''}`,
    planejados: summary.planned,
    copiados: summary.copied,
    bytes_copiados: formatBytes(summary.copiedBytes),
    verificados: summary.verified,
    ausentes: summary.missing,
    divergentes: summary.mismatched,
    extras: summary.extra,
    falhas_copia: summary.copyFailures,
    falhas_bucket: summary.bucketFailures,
    falhas_verificacao: summary.verificationFailures,
    avisos_metadata: summary.metadataWarnings + summary.metadataUnverified,
  }))

  console.log('\nResumo por bucket:')
  if (rows.length > 0) console.table(rows)
  else console.log('(nenhum bucket selecionado)')

  const totalFailures = globalFailures + summaries.reduce(
    (total, summary) => total
      + summary.copyFailures
      + summary.bucketFailures
      + summary.verificationFailures,
    0,
  )
  const totalObjects = summaries.reduce((total, summary) => total + summary.objectsFound, 0)
  const totalBytes = summaries.reduce((total, summary) => total + summary.sourceBytes, 0)
  const totalCopied = summaries.reduce((total, summary) => total + summary.copied, 0)

  console.log(
    `Total: ${summaries.length} buckets, ${totalObjects} objetos, ${formatBytes(totalBytes)} conhecidos, ` +
    `${totalCopied} copiados, ${totalFailures} falhas.`,
  )
  if (configuration.dryRun && !configuration.verifyOnly) {
    console.log('Dry-run concluido: nenhuma configuracao ou objeto foi alterado.')
  }

  return totalFailures
}

async function main() {
  const argumentsResult = parseArguments(process.argv.slice(2))
  if (argumentsResult.help) {
    console.log(HELP)
    return
  }

  const configuration = buildConfiguration(argumentsResult)
  const sensitiveValues = [
    configuration.sourceUrl,
    configuration.sourceKey,
    configuration.targetUrl,
    configuration.targetKey,
  ]
  runtimeSensitiveValues = sensitiveValues
  const sourceClient = createStorageClient(configuration.sourceUrl, configuration.sourceKey)
  const targetClient = createStorageClient(configuration.targetUrl, configuration.targetKey)

  const mode = configuration.verifyOnly
    ? 'somente verificacao'
    : configuration.dryRun
      ? 'dry-run'
      : configuration.verify
        ? 'copia com verificacao'
        : 'copia sem verificacao'
  console.log(`Modo: ${mode}. Concorrencia: ${configuration.concurrency}. Pagina: ${configuration.pageSize}.`)
  console.warn(
    'Aviso: owner/owner_id, IDs, ETags e timestamps de objetos nao sao preservados pela API de upload.',
  )

  let globalFailures = 0
  let sourceBuckets
  let targetBuckets
  try {
    ;[sourceBuckets, targetBuckets] = await Promise.all([
      listAllBuckets(sourceClient, 'origem', configuration, sensitiveValues),
      listAllBuckets(targetClient, 'destino', configuration, sensitiveValues),
    ])
  } catch (error) {
    throw new Error(`Falha no inventario inicial: ${safeError(error, sensitiveValues)}`)
  }

  const sourceById = new Map(sourceBuckets.map((bucket) => [bucket.id, bucket]))
  const targetById = new Map(targetBuckets.map((bucket) => [bucket.id, bucket]))
  const discardedSourceBucket = sourceById.get(DISCARDED_BUCKET_ID)
  const discardedTargetBucket = targetById.get(DISCARDED_BUCKET_ID)
  if (!discardedSourceBucket) {
    throw new Error('chat-media nao existe na origem; inventario aprovado divergiu.')
  }
  if (!discardedTargetBucket) {
    throw new Error(
      'chat-media nao existe no destino; a configuracao do bucket deve ser preservada.',
    )
  }
  if (!bucketConfigurationsMatch(discardedSourceBucket, discardedTargetBucket)) {
    throw new Error('a configuracao preservada de chat-media diverge entre origem e destino.')
  }
  const discardedTargetObjects = await listAllObjects(
    targetClient,
    DISCARDED_BUCKET_ID,
    'destino descartavel',
    configuration,
    sensitiveValues,
  )
  if (discardedTargetObjects.length !== 0) {
    throw new Error(
      `chat-media possui ${discardedTargetObjects.length} objetos no destino; ` +
      'execute o descarte target-only antes da copia.',
    )
  }
  console.log(
    'Bucket chat-media: configuracao preservada, vazio no destino e excluido da copia ' +
    '(o inventario final e registrado dinamicamente durante o corte).',
  )

  let selectedBuckets = sourceBuckets.filter((bucket) => bucket.id !== DISCARDED_BUCKET_ID)

  if (configuration.bucketFilter) {
    for (const requestedId of configuration.bucketFilter) {
      if (!sourceById.has(requestedId)) {
        globalFailures += 1
        console.error(`Bucket solicitado nao existe na origem: ${displayName(requestedId)}.`)
      }
    }
    const selectedIds = new Set(configuration.bucketFilter)
    selectedBuckets = sourceBuckets.filter(
      (bucket) => bucket.id !== DISCARDED_BUCKET_ID && selectedIds.has(bucket.id),
    )
  }

  selectedBuckets.sort((left, right) => left.id.localeCompare(right.id))
  console.log(
    `Buckets encontrados na origem: ${sourceBuckets.length}; selecionados: ${selectedBuckets.length}.`,
  )

  const summaries = []
  for (const sourceBucket of selectedBuckets) {
    const summary = newBucketSummary(sourceBucket.id)
    summaries.push(summary)

    if (sourceBucket.type && String(sourceBucket.type).toUpperCase() !== 'STANDARD') {
      summary.bucketFailures += 1
      console.error(
        `Bucket ${displayName(sourceBucket.id)} usa tipo nao suportado: ${displayName(sourceBucket.type)}.`,
      )
      continue
    }

    let objects
    try {
      objects = await listAllObjects(
        sourceClient,
        sourceBucket.id,
        'origem',
        configuration,
        sensitiveValues,
      )
    } catch (error) {
      summary.bucketFailures += 1
      console.error(
        `Falha ao inventariar bucket ${displayName(sourceBucket.id)}: ${safeError(error, sensitiveValues)}`,
      )
      continue
    }

    const sourceSize = sumKnownBytes(objects)
    summary.objectsFound = objects.length
    summary.sourceBytes = sourceSize.bytes
    summary.unknownSizes = sourceSize.unknown
    summary.planned = objects.length
    console.log(
      `Bucket ${displayName(sourceBucket.id)}: ${objects.length} objetos, ` +
      `${formatBytes(sourceSize.bytes)} conhecidos${sourceSize.unknown ? `, ${sourceSize.unknown} sem tamanho` : ''}.`,
    )

    if (!configuration.verifyOnly) {
      const targetReady = await ensureTargetBucket(
        sourceBucket,
        targetById.get(sourceBucket.id),
        targetClient,
        configuration,
        sensitiveValues,
        summary,
      )

      if (!configuration.dryRun && targetReady) {
        await copyBucketObjects(
          sourceClient,
          targetClient,
          sourceBucket.id,
          objects,
          configuration,
          sensitiveValues,
          summary,
        )
      } else if (!configuration.dryRun && !targetReady) {
        console.error(`Bucket ${displayName(sourceBucket.id)} indisponivel; objetos nao foram copiados.`)
      }
    }

    const shouldVerify = configuration.verifyOnly
      || (configuration.verify && !configuration.dryRun)
    if (shouldVerify) {
      await verifyBucket(
        sourceClient,
        targetClient,
        sourceBucket,
        configuration,
        sensitiveValues,
        summary,
      )
    }
  }

  const failures = printSummary(summaries, globalFailures, configuration)
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  const isUsageError = error instanceof UsageError
  console.error(
    `${isUsageError ? 'Erro de configuracao' : 'Erro fatal'}: ` +
    redact(error?.message ?? error, runtimeSensitiveValues),
  )
  if (isUsageError) console.error('Use --help para ver os parametros aceitos.')
  process.exitCode = isUsageError ? 2 : 1
})
