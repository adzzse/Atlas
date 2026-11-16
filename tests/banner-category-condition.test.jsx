// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BannerLayoutRenderer from '../src/components/library/bannerLayout/BannerLayoutRenderer.jsx'
import BannerLayoutEditor from '../src/components/settings/bannerEditor/BannerLayoutEditor.jsx'
import {
  createBannerPresetExport,
  normalizeBannerPreset,
  normalizeFieldConditions,
} from '../src/components/library/bannerLayout/bannerLayoutSchema.js'

const categoryField = {
  id: 'category', slot: 'bottom-left', visible: true, badge: true,
  conditions: { source: ['f95'], visualNovelOnly: true },
}
const layout = { image: { visible: false }, fields: [categoryField] }
const game = { title: 'Category test', f95_id: 281339, steam_id: 4423700 }

// Exercise the shared card renderer, including the normalization used by saved presets.
const renderCategory = (category, conditions = categoryField.conditions) => renderToStaticMarkup(
  <BannerLayoutRenderer
    game={{ ...game, category }}
    layout={{ ...layout, fields: [{ ...categoryField, conditions }] }}
  />,
)

afterEach(cleanup)

describe('visual novel category condition', () => {
  it.each(['VN', 'vn', 'Visual Novel', ' VISUAL NOVEL '])('renders %j as a VN badge', (category) => {
    expect(renderCategory(category)).toContain('>VN</div>')
  })

  it.each([
    'Single-player,Steam Cloud,Family Sharing',
    'Single-player,Steam Achievements',
    'Non-VN', 'VN, Action', '', null, undefined,
  ])('hides category %j even when the game also has an F95 link', (category) => {
    const markup = renderCategory(category)
    expect(markup).not.toContain('>VN</div>')
    if (category) expect(markup).not.toContain(category)
  })

  it('keeps other categories when the condition is disabled or absent', () => {
    const category = 'Single-player,Steam Cloud'
    expect(renderCategory(category, { visualNovelOnly: false })).toContain(category)
    expect(renderCategory(category, {})).toContain(category)
    expect(renderCategory('Visual Novel', {})).toContain('>Visual Novel</div>')
  })

  it('still requires the other selected conditions', () => {
    expect(renderCategory('VN', { visualNovelOnly: true, source: ['lewdcorner'] })).not.toContain('>VN</div>')
  })

  it('preserves the condition through preset export and import', () => {
    const exported = JSON.parse(JSON.stringify(createBannerPresetExport(layout, 'F95zone')))
    const imported = normalizeBannerPreset(exported)
    expect(imported.layout.fields.find((field) => field.id === 'category').conditions).toMatchObject({
      visualNovelOnly: true, source: ['f95'],
    })
    expect(normalizeFieldConditions({ visualNovelOnly: 'false' }).visualNovelOnly).toBe(false)
  })

  it('offers the checkbox only for Category and preserves the source condition when toggled', () => {
    const onFieldChange = vi.fn()
    const { rerender } = render(
      <BannerLayoutEditor
        layout={{ ...layout, fields: [{ ...categoryField, conditions: { source: ['f95'] } }] }}
        fieldLabels={{ category: 'Category' }}
        slotLabels={{ 'bottom-left': 'Bottom left' }}
        badgeFields={new Set(['category'])}
        fieldRegistry={[{ id: 'category', label: 'Category', category: 'Metadata' }]}
        fieldCategories={['Metadata']}
        onFieldChange={onFieldChange}
      />,
    )
    fireEvent.click(screen.getByTitle('Category'))
    fireEvent.click(screen.getByLabelText('Visual novels only (VN)'))
    expect(onFieldChange).toHaveBeenLastCalledWith('category', {
      conditions: { source: ['f95'], visualNovelOnly: true },
    })

    rerender(
      <BannerLayoutEditor
        layout={{ ...layout, fields: [{ ...categoryField, id: 'engine' }] }}
        fieldLabels={{ engine: 'Engine' }}
        slotLabels={{ 'bottom-left': 'Bottom left' }}
        badgeFields={new Set(['engine'])}
        fieldRegistry={[{ id: 'engine', label: 'Engine', category: 'Basic' }]}
        fieldCategories={['Basic']}
        onFieldChange={onFieldChange}
      />,
    )
    fireEvent.click(screen.getByTitle('Engine'))
    expect(screen.queryByLabelText('Visual novels only (VN)')).toBeNull()
  })
})
