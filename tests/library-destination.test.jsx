// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import CollectionModal from '../src/components/collections/CollectionModal.jsx'
import LibraryDestination from '../src/components/library/LibraryDestination.jsx'
import InstallModal from '../src/components/downloads/InstallModal.jsx'

afterEach(() => { cleanup(); delete window.electronAPI })

test('create/edit collection submits and preserves the creator-folder opt-in', () => {
  const onSubmit = vi.fn()
  const { rerender } = render(<CollectionModal open initialName="Studio" onSubmit={onSubmit} />)
  fireEvent.click(screen.getByLabelText('Group games by creator'))
  fireEvent.click(screen.getByText('Create'))
  expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Studio', groupByCreator: true })
  rerender(<CollectionModal open mode="rename" initialName="Studio" initialGroupByCreator onSubmit={onSubmit} />)
  expect(screen.getByLabelText('Group games by creator').checked).toBe(true)
})

test('changing collection asks main for the new destination without mutating membership', async () => {
  const previewLibraryPath = vi.fn(async (request) => ({
    success: true, path: request.collectionId === 3 ? 'D:\\Homework\\Studio\\Game\\v1' : 'D:\\Homework\\Game\\v1',
  }))
  window.electronAPI = {
    getCollections: async () => ({ collections: [{ id: 3, name: 'Studio', groupByCreator: true }] }),
    previewLibraryPath,
  }
  // A controlled picker ensures the exact selected id travels into the request.
  function Example() {
    const [collectionId, setCollectionId] = useState(null)
    return <LibraryDestination game={{ title: 'Game', creator: 'Studio' }} version="v1" collectionId={collectionId} onCollectionChange={setCollectionId} />
  }
  render(<Example />)
  await screen.findByText('D:\\Homework\\Game\\v1')
  await screen.findByText('Studio (creator folders)')
  fireEvent.change(screen.getByLabelText('Add to collection'), { target: { value: '3' } })
  await screen.findByText('D:\\Homework\\Studio\\Game\\v1')
  expect(previewLibraryPath.mock.calls.at(-1)[0]).toMatchObject({ version: 'v1', collectionId: 3 })
})

test('Install sends the selected collection with the confirmed version', async () => {
  const downloadsInstall = vi.fn(async () => ({ success: true }))
  window.electronAPI = {
    getCollections: async () => ({ collections: [{ id: 3, name: 'Studio', groupByCreator: true }] }),
    previewLibraryPath: async () => ({ success: true, path: 'D:\\Homework\\Studio\\Game\\v1' }),
    downloadsInstall,
  }
  render(<InstallModal open item={{ id: 1, title: 'Game', version: 'v1', onComplete: 'add' }} onClose={() => {}} />)
  await screen.findByText('Studio (creator folders)')
  fireEvent.change(screen.getByLabelText('Add to collection'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  await waitFor(() => expect(downloadsInstall).toHaveBeenCalledWith(expect.objectContaining({ id: 1, version: 'v1', collectionId: 3 })))
})

test('a collection policy change refreshes the destination in an already open form', async () => {
  let grouped = false
  let notifyChanged
  window.electronAPI = {
    getCollections: async () => ({ collections: [{ id: 3, name: 'Studio', groupByCreator: grouped }] }),
    onCollectionsChanged: (listener) => { notifyChanged = listener; return () => {} },
    previewLibraryPath: async () => ({ success: true, path: grouped ? 'creator/title/version' : 'title/version' }),
  }
  render(<LibraryDestination game={{ title: 'Game' }} version="v1" collectionId={3} onCollectionChange={() => {}} />)
  await screen.findByText('title/version')
  grouped = true
  await act(async () => { notifyChanged() })
  await screen.findByText('creator/title/version')
})
