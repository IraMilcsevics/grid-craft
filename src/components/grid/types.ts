import type { ColumnKey } from '../../domain/schema'
import type { OrderTable } from '../columns'

export type LeafColumns = ReturnType<OrderTable['getVisibleLeafColumns']>
export type GridRows = ReturnType<OrderTable['getRowModel']>['rows']

/** The selected cell, by row id so it survives sorting and filtering. */
export interface CellRef {
  id: string
  col: ColumnKey
}

export interface EditingCell extends CellRef {
  /** Set when editing started by typing a character: it replaces the cell content. */
  initial?: string
}
