export type ReportPreviewTheme = 'light' | 'dark'

/** Wrap rendered report HTML in a minimal document with resets + theme-aware surfaces. */
export function buildReportPreviewDocument(fragmentHtml: string, theme: ReportPreviewTheme): string {
  const isDark = theme === 'dark'
  const htmlAttrs = (isDark ? ' class="dark"' : '') + ' lang="en" dir="ltr"'
  const scheme = isDark ? 'dark' : 'light'

  const css = `
:root { color-scheme: ${scheme}; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  height: auto;
  width: 100%;
  overflow-x: visible;
  overflow-y: visible;
}
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
/* Root fills the iframe width; horizontal scroll lives here when tables are wide */
.tails-report-preview-root {
  isolation: isolate;
  position: relative;
  width: 100%;
  min-height: 100%;
  height: auto;
  max-height: none;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  overflow-y: visible;
  box-sizing: border-box;
  color: #171717;
  background-color: #fafafa;
}
html.dark .tails-report-preview-root {
  color: #e4e4e7;
  background-color: #0f0f12;
}
/* Full-width column so narrow reports center visually; wide tables widen the scrollable root */
.tails-report-preview-inner {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.tails-report-preview-root table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  max-width: none;
  position: relative;
  z-index: 0;
  table-layout: auto;
}
.tails-report-preview-root td,
.tails-report-preview-root th {
  position: relative;
  z-index: auto;
  vertical-align: top;
  overflow: visible;
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  padding: 0.5rem 0.65rem;
  white-space: nowrap;
}
.tails-report-preview-root td {
  white-space: normal;
  min-width: 5.5rem;
}
/* Templates hard-code dark body text; force readable contrast in dark mode */
html.dark .tails-report-preview-root .tails-report {
  color: #e4e4e7 !important;
}
html.dark .tails-report-preview-root td {
  color: #e4e4e7 !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}
html.dark .tails-report-preview-root th {
  color: #fafafa !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}
.tails-report-preview-root img,
.tails-report-preview-root svg {
  max-width: 100%;
  height: auto;
}
/* Disable template row hover (e.g. .tails-report tbody tr:hover) */
.tails-report-preview-root tbody tr:hover,
.tails-report-preview-root .tails-report tbody tr:hover {
  background-color: transparent !important;
}
/* Light document only: templates sometimes inherit “dark UI” grays; keep table body readable */
html:not(.dark) .tails-report-preview-root .tails-report tbody td {
  color: #111827;
}
`

  // After fragment: beat embedded `.tails-report table { width: 100% }` so columns don't collapse in narrow iframes.
  const layoutTailCss = `
/* Override late-loaded template CSS (e.g. width:100%) so numeric columns stay visible */
.tails-report-preview-root table {
  width: max-content !important;
  min-width: 100% !important;
  table-layout: auto !important;
}
.tails-report-preview-root th,
.tails-report-preview-root td {
  overflow: visible !important;
}
.tails-report-preview-root td.num,
.tails-report-preview-root th.num,
.tails-report-preview-root .num {
  min-width: 3.25rem !important;
  white-space: nowrap !important;
}
`

  // Appended after fragment so these beat embedded template <style> blocks (same document order).
  const themeTailCss = isDark
    ? `
html.dark .tails-report-preview-root .tails-section-header {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #e0e7ff !important;
  border: 1px solid rgba(96, 165, 250, 0.35) !important;
}
html.dark .tails-report-preview-root .tails-card {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: #18181b !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
}
html.dark .tails-report-preview-root .tails-card-header,
html.dark .tails-report-preview-root .tails-card-title {
  background: linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%) !important;
  color: #f8fafc !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.25) !important;
}
html.dark .tails-report-preview-root .tails-card-body {
  background: #27272a !important;
  color: #e4e4e7 !important;
}
html.dark .tails-report-preview-root .tails-report tbody tr:nth-child(odd) {
  background-color: #27272a !important;
}
html.dark .tails-report-preview-root .tails-report tbody tr:nth-child(even) {
  background-color: #1f1f23 !important;
}
html.dark .tails-report-preview-root .tails-report tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.06) !important;
}
html.dark .tails-report-preview-root .tails-charts-grid {
  gap: 14px !important;
}
html.dark .tails-report-preview-root .tails-report th {
  background-color: #3f3f46 !important;
}
`
    : ''

  const metricClickCss = `
.tails-report-preview-root td.metric-name {
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.tails-report-preview-root td.metric-name:hover {
  background: rgba(99, 102, 241, 0.10) !important;
  box-shadow: inset 0 0 0 1.5px rgba(99, 102, 241, 0.35);
  border-radius: 3px;
}
html.dark .tails-report-preview-root td.metric-name:hover {
  background: rgba(129, 140, 248, 0.15) !important;
  box-shadow: inset 0 0 0 1.5px rgba(129, 140, 248, 0.4);
}
`

  const metricClickScript = `
<script>
(function() {
  function getSectionHeader(td) {
    var table = td.closest('table');
    if (!table) return '';
    var prev = table.previousElementSibling;
    while (prev) {
      var tag = prev.tagName;
      if (tag === 'H2' || tag === 'H3' || tag === 'H4') return prev.textContent.trim();
      prev = prev.previousElementSibling;
    }
    return '';
  }

  function getColumnDates(td) {
    var table = td.closest('table');
    if (!table) return [];
    var thead = table.querySelector('thead');
    if (!thead) return [];
    var headerRow = thead.querySelector('tr');
    if (!headerRow) return [];
    var dates = [];
    for (var i = 1; i < headerRow.children.length; i++) {
      var t = headerRow.children[i].textContent.trim();
      if (t) dates.push(t);
    }
    return dates;
  }

  function getRowValues(td) {
    var row = td.parentNode;
    if (!row) return [];
    var table = td.closest('table');
    var thead = table ? table.querySelector('thead') : null;
    var headerRow = thead ? thead.querySelector('tr') : null;
    var pairs = [];
    for (var i = 1; i < row.children.length; i++) {
      var val = row.children[i].textContent.trim();
      var colHeader = headerRow && headerRow.children[i] ? headerRow.children[i].textContent.trim() : '';
      pairs.push({ date: colHeader, value: val });
    }
    return pairs;
  }

  function isMetricNameCell(td) {
    if (td.classList.contains('metric-name')) return true;
    var row = td.parentNode;
    if (!row || row.tagName !== 'TR') return false;
    var tbody = row.parentNode;
    if (!tbody || (tbody.tagName !== 'TBODY' && tbody.tagName !== 'TABLE')) return false;
    if (row.children[0] === td && !td.classList.contains('num')) {
      var text = td.textContent.trim();
      if (text && text !== '-' && text !== '—') return true;
    }
    return false;
  }

  document.addEventListener('click', function(e) {
    var td = e.target.closest('td');
    if (!td) return;
    if (!isMetricNameCell(td)) return;
    e.preventDefault();
    e.stopPropagation();
    var metricName = td.textContent.trim();
    var rect = td.getBoundingClientRect();
    window.parent.postMessage({
      type: 'tails:metric-click',
      metricName: metricName,
      value: '',
      columnHeader: '',
      rowContext: metricName,
      sectionHeader: getSectionHeader(td),
      clickRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      columnDates: getColumnDates(td),
      rowValues: getRowValues(td)
    }, '*');
  });
})();
</script>`

  return (
    '<!DOCTYPE html><html' +
    htmlAttrs +
    '><head><meta charset="utf-8"><base target="_blank"><style>' +
    css +
    '</style></head><body><div class="tails-report-preview-root"><div class="tails-report-preview-inner">' +
    fragmentHtml +
    '</div></div>' +
    '<style id="tails-preview-layout-tail">' +
    layoutTailCss +
    (themeTailCss ? themeTailCss : '') +
    metricClickCss +
    '</style>' +
    metricClickScript +
    '</body></html>'
  )
}
