// 有名なパターン。中身はRLEで持ち、ファイル読み込みと同じ仕組みで置く。

import type { GridSizeKey } from './board'

export type Preset = {
  id: string
  name: string
  group: string
  recommended: GridSizeKey
  rle: string
}

export const PRESETS: Preset[] = [
  { id: 'block', name: 'ブロック', group: '動かない', recommended: 'small', rle: 'x = 2, y = 2\n2o$2o!' },
  { id: 'beehive', name: '蜂の巣', group: '動かない', recommended: 'small', rle: 'x = 4, y = 3\nb2o$o2bo$b2o!' },
  { id: 'blinker', name: 'ブリンカー', group: '点滅する', recommended: 'small', rle: 'x = 3, y = 1\n3o!' },
  { id: 'toad', name: 'ヒキガエル', group: '点滅する', recommended: 'small', rle: 'x = 4, y = 2\nb3o$3o!' },
  { id: 'beacon', name: 'ビーコン', group: '点滅する', recommended: 'small', rle: 'x = 4, y = 4\n2o$2o$2b2o$2b2o!' },
  {
    id: 'pulsar',
    name: 'パルサー',
    group: '点滅する',
    recommended: 'small',
    rle: 'x = 13, y = 13\n2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!',
  },
  { id: 'glider', name: 'グライダー', group: '移動する', recommended: 'small', rle: 'x = 3, y = 3\nbo$2bo$3o!' },
  { id: 'lwss', name: '軽量級宇宙船（LWSS）', group: '移動する', recommended: 'small', rle: 'x = 5, y = 4\nbo2bo$o4b$o3bo$4o!' },
  {
    id: 'gosper-gun',
    name: 'ゴスパーのグライダー銃',
    group: '撃ち続ける',
    recommended: 'medium',
    rle: 'x = 36, y = 9\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
  },
  { id: 'r-pentomino', name: 'Rペントミノ', group: '長く続く', recommended: 'medium', rle: 'x = 3, y = 3\nb2o$2o$bo!' },
  { id: 'acorn', name: 'ドングリ', group: '長く続く', recommended: 'large', rle: 'x = 7, y = 3\nbo$3bo$2o2b3o!' },
  { id: 'diehard', name: 'ダイハード', group: '長く続く', recommended: 'small', rle: 'x = 8, y = 3\n6bo$2o$bo3b3o!' },
]
