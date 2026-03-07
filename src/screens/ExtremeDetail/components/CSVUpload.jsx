import React, { useRef, useEffect } from 'react';

export default function CSVUpload({ csvUpload, isMobile }) {
  var { uploads, preview, uploadResult, parsing, uploading, error, loadUploads, parseFile, upload, clearPreview } = csvUpload;
  var fileInputRef = useRef(null);
  var dropRef = useRef(null);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  function handleFiles(files) {
    if (files && files.length > 0) parseFile(files[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.style.borderColor = 'var(--border)';
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.style.borderColor = 'var(--primary)';
  }

  function handleDragLeave(e) {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = 'var(--border)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>CSV Import</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Upload dividend history, holdings, or transaction exports from your brokerage.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {/* Drop zone */}
      {!preview && !uploadResult && (
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'var(--bg-card)', border: '2px dashed var(--border)',
            borderRadius: 12, padding: '3rem 2rem', textAlign: 'center',
            cursor: 'pointer', transition: 'border-color 0.2s',
          }}
        >
          <input
            ref={fileInputRef} type="file" accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.3 }}>{'\u{1F4C4}'}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {parsing ? 'Parsing...' : 'Drop a CSV file here or click to browse'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            Max 10MB, 10,000 rows. Supports transactions, holdings, and dividend history formats.
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !uploadResult && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{preview.filename}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                Format: {preview.format} &middot; {preview.rows.length} valid rows &middot; {preview.errors.length} errors
              </div>
            </div>
            <button onClick={clearPreview} style={{
              background: 'var(--bg-pill)', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px 10px', fontSize: '0.7rem', borderRadius: 6,
            }}>
              Cancel
            </button>
          </div>

          {/* Preview table */}
          {preview.rows.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    {Object.keys(preview.rows[0]).map(function(key) {
                      return <th key={key} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 500, textTransform: 'uppercase', fontSize: '0.65rem' }}>{key}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map(function(row, i) {
                    return (
                      <tr key={i}>
                        {Object.values(row).map(function(val, j) {
                          return <td key={j} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}>{String(val)}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.rows.length > 10 && (
                <div style={{ textAlign: 'center', padding: '8px', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                  ...and {preview.rows.length - 10} more rows
                </div>
              )}
            </div>
          )}

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>{preview.errors.length} parsing errors:</div>
              {preview.errors.slice(0, 5).map(function(err, i) {
                return (
                  <div key={i} style={{ fontSize: '0.7rem', color: '#ef4444', padding: '2px 0' }}>
                    Row {err.row}: {err.message}
                  </div>
                );
              })}
              {preview.errors.length > 5 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>...and {preview.errors.length - 5} more</div>
              )}
            </div>
          )}

          <button onClick={upload} disabled={uploading || preview.rows.length === 0} style={{
            padding: '10px 24px', cursor: uploading ? 'default' : 'pointer',
            background: uploading || preview.rows.length === 0 ? 'var(--border-accent)' : 'var(--primary)',
            color: 'white', border: 'none', fontSize: '0.85rem',
            fontWeight: 600, borderRadius: 8,
          }}>
            {uploading ? 'Uploading...' : 'Upload ' + preview.rows.length + ' rows'}
          </button>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3CBFA3', marginBottom: 8 }}>Upload Complete</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatBox label="Rows" value={uploadResult.row_count} />
            <StatBox label="Successful" value={uploadResult.success_count} color="#3CBFA3" />
            <StatBox label="Errors" value={uploadResult.error_count} color={uploadResult.error_count > 0 ? '#ef4444' : 'var(--text-dim)'} />
            <StatBox label="Format" value={uploadResult.format_detected || '?'} />
          </div>
          <button onClick={clearPreview} style={{
            padding: '8px 16px', cursor: 'pointer',
            background: 'var(--primary)', color: 'white',
            border: 'none', fontSize: '0.8rem', fontWeight: 600, borderRadius: 8,
          }}>
            Upload Another
          </button>
        </div>
      )}

      {/* Upload History */}
      {uploads.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Upload History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {uploads.map(function(u) {
              return (
                <div key={u.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: 'var(--bg)', borderRadius: 8,
                }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>{u.filename}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: 8 }}>{u.success_count}/{u.row_count} rows</span>
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{u.created_at?.slice(0, 10)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supported Formats */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Supported CSV Formats</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FormatInfo
            title="Transaction Export"
            cols="Date, Action, Ticker, Shares, Price, Amount"
          />
          <FormatInfo
            title="Holdings Import"
            cols="Ticker, Shares, Cost Basis Per Share, Account Type, Purchase Date"
          />
          <FormatInfo
            title="Dividend History"
            cols="Date, Ticker, Amount, Type"
          />
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function FormatInfo({ title, cols }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>{cols}</div>
    </div>
  );
}
