import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDateTime } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IClock, IDoc, IAlert, ICheck, IClose } from '../../components/ui/icons'

export default function ImportHistory() {
  const imports = useCollection('imports')
  const [selectedImport, setSelectedImport] = useState(null)

  const sortedImports = [...imports.data].sort((a, b) => {
    const timeA = a.importDate ? (a.importDate.seconds ? a.importDate.seconds * 1000 : new Date(a.importDate).getTime()) : 0
    const timeB = b.importDate ? (b.importDate.seconds ? b.importDate.seconds * 1000 : new Date(b.importDate).getTime()) : 0
    return timeB - timeA
  })

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Import History Logs</h2>
          <p className="text-xs text-ink-2">Audit trail and validation records of past Excel upload sessions.</p>
        </div>
        <Link to="/admin/import" className="btn-gold py-2 text-xs uppercase tracking-wider font-bold">
          Back to Import Center
        </Link>
      </div>

      {/* Main Table */}
      {imports.loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !imports.data.length ? (
        <EmptyState 
          icon={<IClock size={24} />} 
          title="No history logs recorded" 
          message="Upload bank Excel files in the Import Center to log upload statistics." 
        />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Import Time</th>
                  <th>Filename</th>
                  <th>Total Rows</th>
                  <th>Success</th>
                  <th>Failed</th>
                  <th>Status</th>
                  <th>Triggered By</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedImports.map((imp) => (
                  <tr key={imp.id}>
                    <td className="font-mono text-xs text-ink-2">{imp.importDate ? fmtDateTime(imp.importDate) : '—'}</td>
                    <td className="font-semibold text-ink-1 font-mono">{imp.fileName || '—'}</td>
                    <td className="text-ink-1">{imp.totalRows || 0}</td>
                    <td className="text-ok font-semibold">{imp.successRows || 0}</td>
                    <td className={`font-semibold ${imp.failedRows > 0 ? 'text-danger' : 'text-ink-2'}`}>
                      {imp.failedRows || 0}
                    </td>
                    <td>
                      <StatusBadge status={imp.status || 'completed'} />
                    </td>
                    <td className="text-ink-2">{imp.triggeredBy || 'Administrator'}</td>
                    <td className="text-right">
                      <button 
                        onClick={() => setSelectedImport(imp)} 
                        className="text-xs font-bold text-gold hover:underline"
                      >
                        View Diagnostics ({imp.logs?.length || 0})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diagnostic Log modal */}
      {selectedImport && (
        <ConfirmDialog
          open
          title={`Diagnostics: ${selectedImport.fileName}`}
          confirmLabel="Close"
          onConfirm={() => setSelectedImport(null)}
          onClose={() => setSelectedImport(null)}
        >
          <div className="space-y-4 mt-3 text-left">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-navy-2 p-2 rounded">
                <div className="text-ink-2">Total Rows</div>
                <div className="font-semibold text-ink-1 mt-0.5">{selectedImport.totalRows}</div>
              </div>
              <div className="bg-ok/5 border border-ok/10 p-2 rounded">
                <div className="text-ok">Success</div>
                <div className="font-semibold text-ok mt-0.5">{selectedImport.successRows}</div>
              </div>
              <div className="bg-danger/5 border border-danger/10 p-2 rounded">
                <div className="text-danger">Failed</div>
                <div className="font-semibold text-danger mt-0.5">{selectedImport.failedRows}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Execution Logs</h4>
              {selectedImport.logs && selectedImport.logs.length > 0 ? (
                <div className="rounded border border-navy-4 max-h-[300px] overflow-y-auto bg-navy-2 p-2 space-y-1.5 font-mono text-[11px]">
                  {selectedImport.logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2 border-b border-navy-4/20 py-2 last:border-b-0">
                      <span className="text-ink-2 font-bold whitespace-nowrap">Row {log.row}:</span>
                      <span className={`font-semibold uppercase text-[9px] px-1 rounded h-fit ${
                        log.level === 'error' ? 'bg-danger/10 text-danger' : 'bg-gold-1/10 text-gold-1'
                      }`}>
                        {log.level}
                      </span>
                      <span className="text-ink-1 whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic text-center py-4 bg-navy-2/30 rounded border border-navy-4/50">
                  No issues flagged during this upload session.
                </p>
              )}
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
