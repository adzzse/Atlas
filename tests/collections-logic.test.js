import { groupGamesByCollection, UNCATEGORIZED_ID } from '../src/hooks/useCollections.js';
import {
  buildCollectionContextMenu,
  buildCollectionMenuItems,
} from '../src/components/collections/collectionMenu.js';
import { filterGamesWithState } from '../src/hooks/useFilters.js';

let fail = 0;
const check = (name, cond) => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

const games = [1,2,3,4].map((n) => ({ record_id: n, title: `G${n}`, hasInstalledVersion: true }));
const collections = [{ id: 1, name: 'Alpha', color: '#fff' }, { id: 2, name: 'Beta', color: null }];
// g1 -> Alpha; g2 -> Alpha+Beta; g3,g4 -> nothing
const map = new Map([[1, [1]], [2, [1, 2]]]);

const groups = groupGamesByCollection(games, collections, map);
check('every collection gets a group', groups.filter((g) => g.id !== UNCATEGORIZED_ID).length === 2);
check('multi-collection title appears in both', 
  groups[0].games.length === 2 && groups[1].games.length === 1);
check('uncategorized derived and last',
  groups[groups.length - 1].id === UNCATEGORIZED_ID && groups[groups.length - 1].games.length === 2);

const noneUncategorized = groupGamesByCollection([games[0]], collections, map);
check('uncategorized omitted when empty',
  !noneUncategorized.some((g) => g.id === UNCATEGORIZED_ID));

// Menu: g2 is in both, so Add to should offer only "+ New Collection"
const m2 = buildCollectionMenuItems({ recordId: 2, collections, memberOf: [1, 2] });
check('add-to omits collections already joined', m2[0].submenu.length === 1);
check('add-to always offers New Collection', m2[0].submenu[0].label === '+ New Collection');
check('remove-from lists both', m2[1].label === 'Remove from' && m2[1].submenu.length === 2);

// g3 is in nothing: no "Remove from" at all
const m3 = buildCollectionMenuItems({ recordId: 3, collections, memberOf: [] });
check('no remove-from when uncategorized', m3.length === 1);
check("add-to offers both plus separator plus new", m3[0].submenu.length === 4);

// Filter
const inAlpha = filterGamesWithState(games, { collectionIds: ['1'], installState: 'all', includeUninstalled: true }, { collectionIdsByRecord: map });
check('filter to a collection', inAlpha.length === 2);
const unc = filterGamesWithState(games, { collectionIds: ['uncategorized'], installState: 'all', includeUninstalled: true }, { collectionIdsByRecord: map });
check('filter to uncategorized', unc.length === 2 && unc.every((g) => g.record_id > 2));
const noFilter = filterGamesWithState(games, { installState: 'all', includeUninstalled: true }, { collectionIdsByRecord: map });
check('empty collectionIds = no constraint', noFilter.length === 4);

const hiddenCollectionIds = new Set([1]);
const hiddenFromLibrary = filterGamesWithState(
  games,
  { installState: 'all', includeUninstalled: true },
  { collectionIdsByRecord: map, hiddenCollectionIds },
);
check('hidden collection members stay out of the main library',
  hiddenFromLibrary.map((game) => game.record_id).join(',') === '3,4');

const openedHiddenCollection = filterGamesWithState(
  games,
  { collectionIds: ['1'], installState: 'all', includeUninstalled: true },
  { collectionIdsByRecord: map, hiddenCollectionIds },
);
check('opening a collection still shows its hidden members',
  openedHiddenCollection.map((game) => game.record_id).join(',') === '1,2');

const openedOtherCollection = filterGamesWithState(
  games,
  { collectionIds: ['2'], installState: 'all', includeUninstalled: true },
  { collectionIdsByRecord: map, hiddenCollectionIds },
);
check('an explicit second collection can still reveal a shared title',
  openedOtherCollection.map((game) => game.record_id).join(',') === '2');

const visibleMenu = buildCollectionContextMenu(collections[0]);
const visibleToggle = visibleMenu.find((item) => item.label === 'Hide Games from Main Library');
check('collection menu offers the visibility toggle',
  visibleToggle?.type === 'checkbox'
  && visibleToggle.checked === false
  && visibleToggle.data.hideFromLibrary === true);

const hiddenMenu = buildCollectionContextMenu({ ...collections[0], hideFromLibrary: true });
const hiddenToggle = hiddenMenu.find((item) => item.label === 'Hide Games from Main Library');
check('collection menu can restore main-library visibility',
  hiddenToggle?.checked === true && hiddenToggle.data.hideFromLibrary === false);

import { test, expect } from "vitest"
test("collections logic", () => { expect(fail).toBe(0) })
