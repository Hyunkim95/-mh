// Narrow interfaces for the Helius asset shape we consume on the client
export interface AssetContentFile {
  cdn_uri?: string
}

export interface AssetContentMetadata {
  name?: string
  symbol?: string
}

export interface AssetContent {
  metadata?: AssetContentMetadata
  files?: AssetContentFile[]
}

export interface HeliusAssetLike {
  id?: string
  content?: AssetContent
  token_info?: {
    decimals?: number
    balance?: number | string
    price_per_token?: number
    price_info?: {
      total_price?: number
      price_per_token?: number
    }
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function hasContentFiles(
  x: unknown
): x is { content: { files: AssetContentFile[] } } {
  if (!isObject(x)) return false
  const content = x['content']
  if (!isObject(content)) return false
  const files = content['files']
  return Array.isArray(files)
}

export function hasContentMetadata(
  x: unknown
): x is { content: { metadata: AssetContentMetadata } } {
  if (!isObject(x)) return false
  const content = x['content']
  if (!isObject(content)) return false
  return 'metadata' in content && isObject(content['metadata'])
}

export function hasTokenInfo(
  x: unknown
): x is {
  token_info: {
    decimals?: number
    balance?: number | string
    price_per_token?: number
    price_info?: { total_price?: number; price_per_token?: number }
  }
} {
  if (!isObject(x)) return false
  return 'token_info' in x
}
