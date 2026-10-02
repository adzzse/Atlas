import { useEffect, useId, useState } from 'react'
import { useCollections } from '../../hooks/useCollections.js'

// Installation and both import windows must preview the main process's path,
// including membership overrides, rather than duplicating its naming rules.
export default function LibraryDestination({
  game, recordId, downloadId, version, collectionId, onCollectionChange,
  format, replaceVersionId, label = 'Destination',
}) {
  const { collections, error: collectionsError } = useCollections()
  const selectId = useId()
  const [preview, setPreview] = useState(null)
  const request = JSON.stringify({
    game: {
      title: game?.title || game?.name, creator: game?.creator || game?.developer,
      engine: game?.engine, atlasId: game?.atlasId || game?.atlas_id,
      f95Id: game?.f95Id || game?.f95_id, lcId: game?.lcId || game?.lc_id,
      steamId: game?.steamId || game?.steam_id, gogId: game?.gogId || game?.gog_id,
    },
    recordId, downloadId, version, collectionId, format, replaceVersionId,
  })

  // Ignore an older reply after a version/collection edit or closing the form.
  useEffect(() => {
    let active = true
    setPreview(null)
    if (!window.electronAPI?.previewLibraryPath) return undefined
    Promise.resolve(window.electronAPI.previewLibraryPath(JSON.parse(request)))
      .then((result) => { if (active) setPreview(result) })
      .catch((error) => { if (active) setPreview({ success: false, error: error.message }) })
    return () => { active = false }
  }, [request, collections])

  return (
    <div className="space-y-2 text-xs">
      <label htmlFor={selectId} className="block text-text">Add to collection</label>
      <select
        id={selectId}
        value={collectionId ?? ''}
        onChange={(event) => onCollectionChange(event.target.value ? Number(event.target.value) : null)}
        className="w-full bg-secondary border border-border rounded-buttonTheme p-2 text-text"
      >
        <option value="">No additional collection</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}{collection.groupByCreator ? ' (creator folders)' : ''}
          </option>
        ))}
      </select>
      {collectionsError && <p className="text-danger">{collectionsError}</p>}
      <div className="rounded border border-border bg-tertiary/40 p-2">
        <span className="text-muted">{label}</span>
        <p className={`mt-1 break-all font-mono ${preview?.success === false ? 'text-danger' : 'text-text'}`}>
          {preview?.path || preview?.error || 'Calculating destination…'}
        </p>
      </div>
    </div>
  )
}
