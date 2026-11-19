import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import './InventoryPhoto.css'

export default function InventoryPhoto({ resource, id, hasPhoto, version, alt, className = '', fallback }: {
  resource: 'brands' | 'items'; id: string; hasPhoto?: boolean; version?: string | null
  alt: string; className?: string; fallback?: ReactNode
}) {
  const key = `${resource}/${id}/${version ?? ''}/${Boolean(hasPhoto)}`
  const [loaded, setLoaded] = useState({ key: '', url: '' })
  useEffect(() => {
    if (!hasPhoto) return
    let cancelled = false
    let objectUrl = ''
    void api.requestBlob(`/${resource}/${encodeURIComponent(id)}/photo`).then((blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setLoaded({ key, url: objectUrl })
    }).catch(() => { /* Keep the existing placeholder if a picture is unavailable. */ })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [key, resource, id, hasPhoto])
  const url = loaded.key === key ? loaded.url : ''
  return <span className={`inventory-photo ${className}`}>{url
    ? <img src={url} alt={alt} loading="lazy" onError={() => setLoaded({ key, url: '' })} />
    : fallback ?? <span aria-hidden="true">No picture</span>}</span>
}
