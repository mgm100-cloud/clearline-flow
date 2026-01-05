import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react'
import './DataGrid.css'

const DataGrid = ({
  columns,
  data,
  loading,
  pagination,
  onPageChange,
  onSort,
  onRowClick,
  onEdit,
  onDelete,
  onCellEdit,
  sortBy,
  sortOrder,
}) => {
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')

  const handleSort = (columnId) => {
    if (onSort) {
      const newOrder = sortBy === columnId && sortOrder === 'asc' ? 'desc' : 'asc'
      onSort(columnId, newOrder)
    }
  }

  const handleCellDoubleClick = (rowId, columnId, currentValue) => {
    if (onCellEdit) {
      setEditingCell({ rowId, columnId })
      setEditValue(currentValue || '')
    }
  }

  const handleCellBlur = async () => {
    if (editingCell && onCellEdit) {
      await onCellEdit(editingCell.rowId, editingCell.columnId, editValue)
    }
    setEditingCell(null)
  }

  const handleCellKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCellBlur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  const renderCell = (row, column) => {
    const value = row[column.id]
    const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === column.id

    if (isEditing) {
      return (
        <input
          type="text"
          className="data-grid-cell-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleCellKeyDown}
          autoFocus
        />
      )
    }

    if (column.render) {
      return column.render(value, row)
    }

    return value || '-'
  }

  return (
    <div className="data-grid-container">
      {loading && (
        <div className="data-grid-loading">
          <div className="data-grid-spinner" />
          <div>Loading...</div>
        </div>
      )}

      <div className="data-grid-table-wrapper">
        <table className="data-grid-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={`data-grid-th ${column.sortable ? 'sortable' : ''}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="data-grid-th-content">
                    <span>{column.label}</span>
                    {column.sortable && sortBy === column.id && (
                      <span className="data-grid-sort-icon">
                        {sortOrder === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {(onEdit || onDelete) && <th className="data-grid-th actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data && data.length > 0 ? (
              data.map((row) => (
                <tr
                  key={row.id}
                  className="data-grid-tr"
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="data-grid-td"
                      onDoubleClick={() =>
                        column.editable && handleCellDoubleClick(row.id, column.id, row[column.id])
                      }
                    >
                      {renderCell(row, column)}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td className="data-grid-td actions">
                      <div className="data-grid-actions">
                        {onEdit && (
                          <button
                            className="data-grid-action-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEdit(row)
                            }}
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="data-grid-action-btn delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm('Are you sure you want to delete this item?')) {
                                onDelete(row.id)
                              }
                            }}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="data-grid-empty">
                  {loading ? 'Loading...' : 'No data available'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="data-grid-pagination">
          <div className="data-grid-pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="data-grid-pagination-controls">
            <button
              className="data-grid-pagination-btn"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <div className="data-grid-pagination-pages">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (pagination.page <= 3) {
                  pageNum = i + 1
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i
                } else {
                  pageNum = pagination.page - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    className={`data-grid-pagination-page ${
                      pagination.page === pageNum ? 'active' : ''
                    }`}
                    onClick={() => onPageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              className="data-grid-pagination-btn"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataGrid

