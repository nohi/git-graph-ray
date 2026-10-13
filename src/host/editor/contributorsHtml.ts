export function contributorsHtml(webviewCsp: string, script: string, css: string, n: string, repoPath: string): string {
  const repo = escAttr(repoPath);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewCsp} https: data:; style-src ${webviewCsp} 'unsafe-inline'; script-src ${webviewCsp} 'nonce-${n}';" />
  <link rel="stylesheet" href="${css}" />
  <title>Contributors</title>
</head>
<body data-page="contributors" data-theme="classic" data-repo="${repo}" style="margin:0;padding:0;width:100%">
  <header class="bar">
    <h1 class="contrib-title">Contributors</h1>
    <span id="contrib-repo" class="contrib-repo"></span>
    <span class="bar-end">
      <button type="button" id="contrib-reload" title="Refresh" aria-label="Refresh">Refresh</button>
    </span>
  </header>
  <div class="contrib-page">
    <div class="contrib-tools">
      <div class="ref-tabs" role="tablist">
        <button type="button" role="tab" id="contrib-tab-author" aria-selected="true">Author</button>
        <button type="button" role="tab" id="contrib-tab-committer" aria-selected="false">Committer</button>
      </div>
      <label class="contrib-period">Period
        <select id="contrib-period">
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <span id="contrib-custom" class="contrib-custom" hidden>
        <input type="date" id="contrib-from" aria-label="From" />
        <span aria-hidden="true">–</span>
        <input type="date" id="contrib-to" aria-label="To" />
      </span>
      <span id="contrib-period-note" class="contrib-period-note">Author date</span>
      <search>
        <input type="search" id="contrib-q" placeholder="Find a name" />
      </search>
    </div>
    <p id="contrib-status" class="contrib-status">Reading history…</p>
    <div class="contrib-table-wrap">
      <table class="contrib-table">
        <thead>
          <tr>
            <th aria-sort="none"><button type="button" data-sort="name">Name</button></th>
            <th class="num" aria-sort="descending"><button type="button" data-sort="commits">Commits</button></th>
            <th class="num" aria-sort="none"><button type="button" data-sort="additions">Added</button></th>
            <th class="num" aria-sort="none"><button type="button" data-sort="deletions">Deleted</button></th>
          </tr>
        </thead>
        <tbody id="contrib-rows"></tbody>
      </table>
    </div>
  </div>
  <script nonce="${n}" src="${script}"></script>
</body>
</html>`;
}

function escAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
