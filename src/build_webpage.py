import argparse
import datetime
import json
import markdown
import os
import pandas as pd
import re
import shutil
import subprocess
import urllib.request
from tqdm import tqdm


def fetch_top_entries(releases, file_type="host"):
    cache_dir = "cache/ranks"
    os.makedirs(cache_dir, exist_ok=True)
    release_entries = {}

    with tqdm(releases, desc=f"Fetching top {file_type}s", leave=False) as progress_bar:
        for release in progress_bar:
            if release in {'cc-main-2017-aug-sep-oct',
                           'cc-main-2017-may-jun-jul',
                           'cc-main-2017-feb-mar-apr'}:
                release_entries[release] = []
                continue
            cache_file = f"{cache_dir}/{release}-{file_type}-top-entries.txt"
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    lines = f.read().strip().split("\n")
                    release_entries[release] = [line.split() for line in lines]
            else:
                url = f"https://data.commoncrawl.org/projects/hyperlinkgraph/{release}/{file_type}/{release}-{file_type}-ranks.txt.gz"
                try:
                    result = subprocess.check_output(f"sleep 2 && curl -s {url} | zcat | head -n 1001", shell=True, text=True)
                    with open(cache_file, "w") as f:
                        f.write(result)
                    release_entries[release] = [line.split() for line in result.strip().split("\n")]
                except Exception as e:
                    print(f"Error fetching data for {release}: {e}")
                    release_entries[release] = []
    return release_entries


def write_rank_json_files(releases, release_entries, file_type, output_dir):
    """Write each release's rank data as a separate JSON file."""
    os.makedirs(output_dir, exist_ok=True)
    for release in releases:
        release_str = str(release)
        top_entries = release_entries[release_str]
        if top_entries:
            data = {
                "header": top_entries[0],
                "rows": top_entries[1:]
            }
        else:
            data = {"header": [], "rows": []}
        out_path = os.path.join(output_dir, f"{file_type}-{release_str}.json")
        with open(out_path, "w") as f:
            json.dump(data, f, separators=(',', ':'))


def fetch_release_dates():
    """Fetch graphinfo.json and build a release ID → date label mapping.

    Each entry has a 'crawls' array with IDs like 'CC-MAIN-2026-08' where
    08 is the ISO week number. We parse the last crawl to get the end date
    and format it as e.g. "Feb '26".
    """
    cache_file = "cache/graphinfo.json"
    os.makedirs("cache", exist_ok=True)

    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            data = json.load(f)
    else:
        try:
            url = "https://index.commoncrawl.org/graphinfo.json"
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            with open(cache_file, "w") as f:
                json.dump(data, f)
        except Exception as e:
            print(f"=> | Warning: could not fetch graphinfo.json: {e}")
            return {}

    date_labels = {}
    for entry in data:
        release_id = entry.get("id", "")
        crawls = entry.get("crawls", [])
        if not crawls:
            continue
        # Parse the last crawl: CC-MAIN-YYYY-WW
        last_crawl = crawls[-1]
        m = re.match(r"CC-MAIN-(\d{4})-(\d{2})", last_crawl)
        if not m:
            continue
        year, week = int(m.group(1)), int(m.group(2))
        try:
            # ISO week: Monday of that week, then use the month
            dt = datetime.datetime.strptime(f"{year}-W{week:02d}-1", "%Y-W%W-%w")
            date_labels[release_id] = dt.strftime("%b '%y")  # e.g. "Feb '26"
        except ValueError:
            continue

    return date_labels


def has_comma_separated_values(series):
    return series.astype(str).str.contains(",").any()


def has_zero_signal(series):
    return series.nunique() <= 1


def prepare_chart_data(combined_data, descriptions, date_labels=None):
    """Extract chart data from the combined DataFrame for each metric.

    Returns a dict of {metric: {"releases": [...], "labels": [...], "domain": [...], "host": [...]}}
    suitable for embedding as JSON for Chart.js.
    Aligns domain and host data to the same set of releases, using None for missing values.
    """
    if date_labels is None:
        date_labels = {}
    excluded = [
        'maxindegreenode',
        'maxoutdegreenode',
        'minindegreenode',
        'minoutdegreenode',
        'terminal'
    ]

    chart_data = {}

    # Use all unique releases (preserving order from combined_data categories)
    all_releases = [str(r) for r in combined_data['release'].cat.categories.tolist()]

    # Build lookup dicts per source
    domain_df = combined_data[combined_data['source'] == 'domain'].set_index('release')
    host_df = combined_data[combined_data['source'] == 'host'].set_index('release')

    # Map description keys to data columns where they differ
    col_aliases = {
        'avgdegree': 'avgoutdegree',
    }

    for col in descriptions.keys():
        if col in excluded:
            continue
        data_col = col_aliases.get(col, col)
        if data_col not in combined_data.columns:
            continue
        if has_comma_separated_values(combined_data[data_col]):
            continue
        if has_zero_signal(combined_data[data_col]):
            continue

        domain_vals = []
        host_vals = []
        for r in all_releases:
            # Domain value
            if r in domain_df.index:
                v = domain_df.loc[r, data_col]
                # Handle case where loc returns a Series (duplicate index)
                if isinstance(v, pd.Series):
                    v = v.iloc[0]
                domain_vals.append(float(v) if pd.notna(v) else None)
            else:
                domain_vals.append(None)
            # Host value
            if r in host_df.index:
                v = host_df.loc[r, data_col]
                if isinstance(v, pd.Series):
                    v = v.iloc[0]
                host_vals.append(float(v) if pd.notna(v) else None)
            else:
                host_vals.append(None)

        chart_data[col] = {
            "releases": all_releases,
            "labels": [date_labels.get(r, r) for r in all_releases],
            "domain": domain_vals,
            "host": host_vals
        }

    return chart_data


def build_domain_lookup(ranks_dir, all_releases, date_labels=None):
    """Build a lookup index from the per-release rank JSON files.

    Produces a dict keyed by reversed-domain name, with HC and PR values
    aligned to the full release list.  Written to domain-lookup.json.
    """
    if date_labels is None:
        date_labels = {}
    # Map: reversed_domain -> { release -> (hc_val, pr_val) }
    lookup = {}

    for f in sorted(os.listdir(ranks_dir)):
        if not f.startswith('domain-'):
            continue
        release = f.replace('domain-', '').replace('.json', '')
        filepath = os.path.join(ranks_dir, f)
        try:
            with open(filepath) as fh:
                data = json.load(fh)
        except Exception:
            continue
        for row in data.get('rows', []):
            if len(row) < 5:
                continue
            rev_domain = row[4]
            hc_val = row[1]
            pr_val = row[3]
            if rev_domain not in lookup:
                lookup[rev_domain] = {}
            lookup[rev_domain][release] = (hc_val, pr_val)

    # Convert to aligned arrays
    result = {}
    for rev_domain, release_map in lookup.items():
        hc_vals = []
        pr_vals = []
        for r in all_releases:
            if r in release_map:
                hc_vals.append(float(release_map[r][0]))
                pr_vals.append(float(release_map[r][1]))
            else:
                hc_vals.append(None)
                pr_vals.append(None)
        result[rev_domain] = [hc_vals, pr_vals]

    labels = [date_labels.get(r, r) for r in all_releases]
    return {"releases": all_releases, "labels": labels, "domains": result}


def embed_markdown_file(file_path, heading=''):
    try:
        with open(file_path, "r") as file:
            md_content = file.read()
        html_content = markdown.markdown(md_content)
        # Post-process: add target/rel to external links
        html_content = re.sub(
            r'<a\s+href="(https?://[^"]*)"',
            r'<a href="\1" target="_blank" rel="noopener noreferrer nofollow"',
            html_content
        )
        return f"""
        <div class="markdown-content">
            <h3>{heading}</h3>
            {html_content}
        </div>
"""
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        exit(1)

def embed_file(file_path):
    try:
        with open(file_path, "r") as file:
            file_content = file.read()
        return file_content
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

def copy_to_docs(file_path, dest_name=None):
    """Copy a source file to ../docs/ for external linking."""
    dest = os.path.join("../docs", dest_name or os.path.basename(file_path))
    shutil.copy2(file_path, dest)
    print(f"=> | Copied {file_path} -> {dest}")


parser = argparse.ArgumentParser(description="Generate web statistics page")
args = parser.parse_args()

descriptions_file = "attribute_descriptions.json"

with open(descriptions_file, "r") as file:
    descriptions = json.load(file)

domain_data = pd.read_csv("../docs/domain.tsv", sep="\t")
host_data = pd.read_csv("../docs/host.tsv", sep="\t")

domain_data['source'] = 'domain'
host_data['source'] = 'host'

combined_data = pd.concat([host_data, domain_data], ignore_index=True)

combined_data['release'] = pd.Categorical(
    combined_data['release'],
    ordered=False,
    categories=combined_data['release'].unique()
)

last_updated = datetime.datetime.now().strftime("%Y-%m-%d")
latest_release = combined_data['release'].iloc[-1]
latest_release_url = f"https://data.commoncrawl.org/projects/hyperlinkgraph/{latest_release}/index.html"

# --- Fetch release date labels from graphinfo.json ---
release_date_labels = fetch_release_dates()
if release_date_labels:
    print(f"=> | Fetched date labels for {len(release_date_labels)} releases")
else:
    print("=> | Warning: no date labels available, using release names")

# --- Prepare chart data for interactive charts ---
chart_data = prepare_chart_data(combined_data, descriptions, release_date_labels)

# --- Write rank data as JSON files instead of embedding in HTML ---
ranks_dir = "../docs/ranks"
releases = combined_data['release'].unique()

for file_type in ['domain', 'host']:
    release_entries = fetch_top_entries(releases, file_type)
    write_rank_json_files(releases, release_entries, file_type, ranks_dir)

# --- Build domain lookup index for the domain search feature ---
all_releases_str = [str(r) for r in combined_data['release'].cat.categories.tolist()]
domain_lookup = build_domain_lookup(ranks_dir, all_releases_str, release_date_labels)
with open("../docs/domain-lookup.json", "w") as f:
    json.dump(domain_lookup, separators=(',', ':'), fp=f)
print(f"=> | Wrote domain-lookup.json ({len(domain_lookup['domains'])} domains)")

# --- Build HTML ---

html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Common Crawl Web Graph Statistics</title>
    <meta name="description" content="Interactive visualisations, domain and host rankings, and graph metrics from the Common Crawl Web Graph dataset. Explore PageRank, harmonic centrality, and more across all releases.">
    <link rel="canonical" href="https://commoncrawl.github.io/cc-webgraph-statistics/">
    <link rel="icon" href="img/favicon.png" type="image/png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@100..900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/default.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js" defer></script>

    <meta property="og:title"  content="Common Crawl Web Graph Statistics">
    <meta name="twitter:title" content="Common Crawl Web Graph Statistics">
    <meta property="og:description"  content="Interactive visualisations, domain and host rankings, and graph metrics from the Common Crawl Web Graph dataset.">
    <meta name="twitter:description" content="Interactive visualisations, domain and host rankings, and graph metrics from the Common Crawl Web Graph dataset.">
    <meta property="og:image"  content="https://commoncrawl.github.io/cc-webgraph-statistics/img/masthead.jpg">
    <meta name="twitter:image" content="https://commoncrawl.github.io/cc-webgraph-statistics/img/masthead.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:url" content="https://commoncrawl.github.io/cc-webgraph-statistics/">
    <meta property="og:type" content="website">

    <link rel="stylesheet" href="style.css">
    <script src="pagination.js" defer></script>
"""

copy_to_docs('style.css')
copy_to_docs('pagination.js')

html_content += """
</head>
<body autocapitalize="off">
<script>
console.log("%c" +
"        ,,,        \\n" +
"       (o o)       \\n" +
"   ooO--(_)--Ooo   \\n" +
"                   \\n" +
" Oh hello, curious \\n" +
"  Web Graph user!  \\n",
"font-family:monospace;color:#143171;font-size:12px;");
console.log("%cCommon Crawl\\n%cLike what you see? We're hiring.\\nhttps://commoncrawl.org/jobs",
"font-weight:bold;color:#143171;font-size:12px;","color:#3a5068;font-size:12px;");
</script>
<script>
(function(){
    var p = new URLSearchParams(window.location.search);
    if (p.get('embed') === 'domain-lookup') {
        document.documentElement.classList.add('embed-mode');
        /* Post height to parent for dynamic iframe resizing */
        function postHeight() {
            var h = document.documentElement.scrollHeight;
            window.parent.postMessage({ccEmbed:'domain-lookup',height:h},'*');
        }
        window.addEventListener('DOMContentLoaded', function(){
            postHeight();
            new MutationObserver(postHeight).observe(document.body,{childList:true,subtree:true,attributes:true});
            window.addEventListener('resize', postHeight);
        });
    }
})();
</script>
<nav class="cc-header-wrap" aria-label="Site header">
    <header class="cc-header">
        <a href="./">
          <img src="img/logo.svg" alt="Common Crawl" class="cc-logo">
        </a>
        <div class="cc-htxt">
            <h1>Web Graph Statistics</h1>
            <p>Visualisations and metrics from the Common Crawl Web Graph dataset</p>
        </div>
    </header>
</nav>
"""

html_content += f"""
<main>
<div class="cc-hero">
    <div class="cc-hero-inner">
        <img class="full-width-image" src="img/masthead.webp" alt="" draggable="false">
    </div>
</div>
<div class="update-bar">
    <div class="update-info">
        <span><a href="https://github.com/commoncrawl/cc-webgraph-statistics/commit/main" target="_blank" rel="noopener noreferrer nofollow">Updated {last_updated}</a></span>
        <span class="update-sep"></span>
        <span>Latest release: <a href="{latest_release_url}" target="_blank" rel="noopener noreferrer nofollow">{latest_release}</a></span>
    </div>
</div>
"""

html_content += """
<noscript><p style="padding:20px;text-align:center;">This page requires JavaScript for interactive charts and tables. Please enable JavaScript to view the full content.</p></noscript>
<article>
<div class="cc-twrap">
"""

html_content += embed_markdown_file("description.md", "Description")

html_content += '<h2 id="Top-1000-Ranks"><a href="#Top-1000-Ranks">Top 1000 Ranks</a></h2>'

# Tabbed rank panel — tabs first, shared controls, then table content
html_content += """
<div class="rank-tabbed">
    <div class="rank-tabs" role="tablist" data-active="0">
        <button class="rank-tab active" role="tab" aria-selected="true"
                data-tab="domain" id="tab-domain" aria-controls="panel-domain">Domain</button>
        <button class="rank-tab" role="tab" aria-selected="false"
                data-tab="host" id="tab-host" aria-controls="panel-host">Host</button>
    </div>
    <div class="rank-body">
        <div class="rank-controls">
            <select id="rank-release-dropdown">
                <option value="">Choose a release...</option>
"""
for release in reversed(releases):
    release_str = str(release)
    html_content += f'                <option value="{release_str}">{release_str}</option>\n'

html_content += """            </select>
            <div class="search-container" id="rank-search-container">
                <div class="search-input-wrap">
                    <input type="text" class="search-input" id="rank-search-input" placeholder="Filter domains (e.g. youtube|vimeo)" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" disabled>
                    <button type="button" class="search-clear" id="rank-search-clear" aria-label="Clear search">&times;</button>
                </div>
                <span class="search-count" id="rank-search-count"></span>
            </div>
            <label class="surt-toggle" id="surt-toggle" title="SURT (Sort-friendly URI Rewriting Transform) shows domains in reversed notation, e.g. com.google instead of google.com">
                <input type="checkbox" id="surt-checkbox"><span class="surt-slider"><span class="surt-label">SURT</span></span>
            </label>
        </div>
        <div class="rank-content" id="rank-content">
            <div class="rank-content-inner">
                <div class="rank-panel active" role="tabpanel" id="panel-domain" aria-labelledby="tab-domain">
                    <div id="table-container-domain"></div>
                </div>
                <div class="rank-panel" role="tabpanel" id="panel-host" aria-labelledby="tab-host" hidden>
                    <div id="table-container-host"></div>
                </div>
            </div>
        </div>
    </div>
</div>
"""

html_content += "<p>These ranks can be found by running the following:</p>"

html_content += """<pre><code class="bash">INDEX_URL="https://index.commoncrawl.org/graphinfo.json"
DATA_BASE_URL="https://data.commoncrawl.org/projects/hyperlinkgraph"

GRAPH_LEVEL="domain"  # "domain" or "host"
RESULTS=1000  # how many results to retrieve

GRAPH_RELEASE="$(curl -fsSL "$INDEX_URL" | jq -r '.[0].id')"
# ... or a specific release e.g. "cc-main-2025-26-dec-jan-feb"

curl -fsSL \\
  "$DATA_BASE_URL/$GRAPH_RELEASE/$GRAPH_LEVEL/$GRAPH_RELEASE-$GRAPH_LEVEL-ranks.txt.gz" \\
  2>/dev/null | gzip -dc | head -n "$((RESULTS + 1))"
</code></pre>"""

html_content += """<p style="background: #e9eff6; border-radius: 6px; padding: 10px 14px; margin: 6px 0 12px; font-size: 0.93em; color: #3a5068;">
These rank files are multiple GiB each, so we pipe to <code>zcat</code> or <code>gunzip</code> and use <code>head</code> to peek at the first few lines without downloading the whole file.<br><strong>Note:</strong> <code>head</code> can stop the stream early, but <code>tail</code> on a gzipped stream generally cannot.
</p><br>\n"""

html_content += '<div><h4 id="What-Are-These-Ranks">What Are These Ranks?</h4>\n'

html_content += "<p><a href='https://en.wikipedia.org/wiki/Centrality#Harmonic_centrality' target='_blank' rel='noopener noreferrer nofollow'>Harmonic Centrality</a> considers how close a node is to others, directly or indirectly. The closer a node is to others, the higher its score. It's based on proximity, not the importance or behaviour of neighbours. We calculate this with <a href='https://webgraph.di.unimi.it/docs/it/unimi/dsi/webgraph/algo/HyperBall.html' target='_blank' rel='noopener noreferrer nofollow'>HyperBall</a>. For more details, see the paper <a href='https://arxiv.org/abs/1308.2140' target='_blank' rel='noopener noreferrer nofollow'>Axioms for Centrality</a> by Boldi and Vigna (2013) and the talk <a href='https://www.youtube.com/watch?v=cnGJtGP4gL4' target='_blank' rel='noopener noreferrer nofollow'>A modern view of centrality measures</a>.</p>\n"

html_content += """<div class="eq-grid">
  <div class="eq-card">
    <div class="eq-header">
      <span class="eq-name">Harmonic Centrality</span>
    </div>
    <div class="eq-body">
      <img src="img/harmcen.svg" alt="Harmonic Centrality: H(v) = sum of 1/d(v,u) for all u not equal to v">
    </div>
    <div class="eq-footer">
      <span class="eq-source">H(v) = &sum;<sub>u&ne;v</sub> 1 / d(v, u)</span>
    </div>
  </div>
  <div class="eq-card">
    <div class="eq-header">
      <span class="eq-name">PageRank</span>
    </div>
    <div class="eq-body">
      <img src="img/pagerank.svg" alt="PageRank: PR(v) = sum of PR(u)/L(u) for all u in backlinks of v">
    </div>
    <div class="eq-footer">
      <span class="eq-source">PR(v) = &sum;<sub>u&isin;B<sub>v</sub></sub> PR(u) / L(u)</span>
    </div>
  </div>
</div>
"""

html_content += "<br><p>With <a href='https://en.wikipedia.org/wiki/PageRank' target='_blank' rel='noopener noreferrer nofollow'>PageRank</a>, each node's score depends on how many important nodes link to it, and how those nodes distribute their importance.  We calculate this with <a href='https://law.di.unimi.it/software/law-docs/it/unimi/dsi/law/rank/PageRankParallelGaussSeidel.html' target='_blank' rel='noopener noreferrer nofollow'>PageRankParallelGaussSeidel</a>.</p>\n"

html_content += "<p>PageRank is susceptible to manipulation (e.g., link farming or creating many interconnected spam pages). These artificial links can inflate the importance of a spam node. Harmonic Centrality is better for reducing this spam, because it's harder to 'game', or exploit through artificial link patterns.</p></div>\n"

# --- Domain Lookup ---
html_content += '<h2 id="Domain-Lookup"><a href="#Domain-Lookup">Domain Lookup</a></h2>\n'

html_content += """
<div class="domain-lookup" id="domain-lookup-box">
    <div class="embed-bar">
        <span class="embed-attribution">Domain rankings from the <a href="https://commoncrawl.github.io/cc-webgraph-statistics/" target="_blank" rel="noopener noreferrer">Common Crawl Web Graph</a> &middot;</span>
        <span class="embed-bar-updated">Updated """ + last_updated + """</span>
        <details class="embed-help">
            <summary title="Embed this on your site"><i class="fas fa-code"></i></summary>
            <div class="embed-help-content">
                <p>Embed this widget on your own site with an <code>iframe</code>. It resizes automatically to fit the content:</p>
<pre><code>&lt;iframe id="cc-domain-lookup"
  src="https://commoncrawl.github.io/cc-webgraph-statistics/?embed=domain-lookup&amp;domain=example.com"
  width="100%" height="300" frameborder="0"
  style="border:1px solid #e2e8f0;border-radius:8px;"&gt;
&lt;/iframe&gt;
&lt;script&gt;
window.addEventListener('message', function(e) {
  if (e.data &amp;&amp; e.data.ccEmbed === 'domain-lookup') {
    document.getElementById('cc-domain-lookup').style.height = e.data.height + 'px';
  }
});
&lt;/script&gt;</code></pre>
                <p>To compare two domains, add <code>&amp;compare=other.com</code> to the URL.</p>
            </div>
        </details>
    </div>
    <p>Search for a domain to see its Harmonic Centrality and PageRank over time. Enter a second domain to compare them side by side. Only domains that appear in the top 1,000 for at least one release are available.</p>
    <div class="domain-search-row">
        <div class="search-input-wrap">
            <input type="text" id="domain-search-input" class="domain-search-input"
                   placeholder="Primary domain (e.g. wikipedia.org)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button type="button" class="search-clear domain-clear" aria-label="Clear search">&times;</button>
        </div>
        <div class="search-input-wrap">
            <input type="text" id="domain-search-input-2" class="domain-search-input"
                   placeholder="Secondary domain (optional)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button type="button" class="search-clear domain-clear" aria-label="Clear search">&times;</button>
        </div>
        <button type="button" id="domain-search-btn" class="domain-search-btn">
            <i class="fas fa-search"></i> Look up
        </button>
    </div>
    <div id="domain-search-msg" class="domain-search-msg"></div>
    <div id="domain-chart-wrap" class="domain-chart-wrap" style="display:none;">
        <div class="chart-wrapper">
            <canvas id="chart-domain-lookup"></canvas>
        </div>
        <div class="chart-range-slider" id="slider-domain-lookup"></div>
    </div>
</div>
"""

html_content += '<h2 id="Statistics-Plots">Statistics Plots</h2>\n'

html_content += '<div class="toc open" id="stats-toc">\n'
html_content += '<div class="toc-header" onclick="document.getElementById(\'stats-toc\').classList.toggle(\'open\')">'
html_content += '<span>Jump to chart</span><span class="toc-toggle"><i class="fas fa-chevron-down"></i></span></div>\n'
html_content += '<div class="toc-body"><ul>\n'

for col in descriptions.keys():
    html_content += f'<li><a href="#{col}">{col}</a></li>\n'
html_content += '</ul>\n</div></div>\n'

html_content += '<p>The following charts are interactive Web Graph <a href="https://webgraph.di.unimi.it/docs/it/unimi/dsi/webgraph/Stats.html" target="_blank" rel="noopener noreferrer nofollow">statistics</a> for all previous releases. Hover for values, click legend items to toggle series, and drag the range bar to zoom.</p>\n'

# --- Embed chart data as a single JSON object ---
html_content += '<script>\nwindow.CHART_DATA = '
html_content += json.dumps(chart_data, separators=(',', ':'))
html_content += ';\n</script>\n'

# --- Generate interactive chart containers ---
for col in descriptions.keys():
    description = descriptions.get(col, "No description available.")
    if col in chart_data:
        html_content += f"""
        <div class="chart-container">
            <h4 id="{col}">
                <a href="#{col}">{col}</a>
            </h4>
            <div class="chart-wrapper">
                <canvas id="chart-{col}"></canvas>
            </div>
            <div class="chart-range-slider" id="slider-{col}"></div>
            <p>{description}</p>
        </div>
"""
    else:
        html_content += f"""
        <div class="chart-container">
            <h4 id="{col}">
                <a href="#{col}">{col}</a>
            </h4>
            <p><i>No chart available for this attribute.</i></p>
            <p>{description}</p>
        </div>
"""

html_content += '<div class="download"><h2>Download Data</h2>\n'
html_content += '<a href="domain.tsv" download class="download-button"><i class="fas fa-download"></i>domain.tsv</a>\n'
html_content += '<a href="host.tsv" download class="download-button"><i class="fas fa-download"></i>host.tsv</a>\n'
html_content += '</div>\n'

html_content += """
<div class="info-cards">
    <div class="info-card">
        <h3 id='related-reading'><a href="#related-reading">Related Reading</a></h3>
        <ul>
            <li>
                <a href='https://arxiv.org/pdf/2012.01946' target='_blank' rel='noopener noreferrer nofollow'>Can I Take Your Subdomain? Exploring Related-Domain Attacks in the Modern Web</a>
            </li>
            <li>
                <a href='https://arxiv.org/abs/1802.05435' target='_blank' rel='noopener noreferrer nofollow'>Analysis of the Web Graph Aggregated by Host and Pay-Level Domain</a>
            </li>
            <li>
                <a href='https://commoncrawl.github.io/cc-examples/?q=Web+Graphs' target='_blank' rel='noopener noreferrer nofollow'>Search for "Web Graphs" on cc-examples</a>
            </li>
            <li>
                <a href='https://index.commoncrawl.org/web-graphs-index.html' target='_blank' rel='noopener noreferrer nofollow'>Web Graphs Index</a>
            </li>
        </ul>
    </div>
    <div class="info-card">
        <h3 id='credits'><a href="#credits">Credits</a></h3>
        <ul>
            <li>
                <a href="http://webdatacommons.org/" target="_blank" rel="noopener noreferrer nofollow">Web Data Commons</a>, for their web graph data set and everything related.
            </li>
            <li>
                <a href="https://about.commonsearch.org/" target="_blank" rel="noopener noreferrer nofollow">Common Search</a>; we first used their web graph to expand the crawler frontier, and Common Search's <a href="https://github.com/commonsearch/cosr-back/" target="_blank" rel="noopener noreferrer nofollow">cosr-back</a> project was an important source of inspiration how to process our data using PySpark.
            </li>
            <li>
                The authors of the <a href="https://webgraph.di.unimi.it/" target="_blank" rel="noopener noreferrer nofollow">WebGraph framework</a>, whose software simplifies the computation of rankings.
            </li>
            <li>
                This project is maintained by <a href="https://github.com/commoncrawl" target="_blank" rel="noopener noreferrer nofollow">Common Crawl</a>.  View the project on <a href="https://github.com/commoncrawl/cc-webgraph-statistics" target="_blank" rel="noopener noreferrer nofollow">GitHub</a>.
            </li>
        </ul>
    </div>
</div>
</div>
</div>
</article>
</main>
"""

# --- Close embed popover on outside click ---
html_content += """<script>
document.addEventListener('click',function(e){
    var d=document.querySelector('.embed-help[open]');
    if(d && !d.contains(e.target)) d.removeAttribute('open');
});
</script>\n"""

# --- Syntax highlighting (deferred, so call after load) ---
html_content += '<script>window.addEventListener("DOMContentLoaded",function(){if(window.hljs)hljs.highlightAll()});</script>\n'

# --- Chart.js + app scripts (all deferred, execute in order after parsing) ---
html_content += '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js" defer></script>\n'
html_content += '<script src="charts.js" defer></script>\n'
html_content += '<script src="domain-lookup.js" defer></script>\n'
html_content += '<script src="parallax.js" defer></script>\n'

copy_to_docs('charts.js')
copy_to_docs('domain-lookup.js')
copy_to_docs('parallax.js')

# --- Floating back-to-top button ---
html_content += """
<a href="#" class="back-to-top" id="back-to-top" aria-label="Back to top">
    <i class="fas fa-chevron-up"></i>
</a>
<script>
(function() {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    var shown = false;
    window.addEventListener('scroll', function() {
        var shouldShow = window.scrollY > 600;
        if (shouldShow !== shown) {
            shown = shouldShow;
            btn.classList.toggle('visible', shown);
        }
    }, { passive: true });
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();
</script>
"""

html_content += """
<footer class="cc-footer">
    <div class="cc-footer-inner">
        <div class="cc-footer-info">
            <span><a href="https://commoncrawl.org" target="_blank" rel="noopener noreferrer nofollow">Common Crawl Foundation</a> is a California 501(c)(3) registered non-profit organization. Hosting of Common Crawl data is covered by <a href="https://aws.amazon.com/opendata/open-data-sponsorship-program/" target="_blank" rel="noopener noreferrer nofollow">Amazon Web Services' Open Data Sponsorship Program</a>.</span>
            <div class="cc-footer-links">
                <a href="https://commoncrawl.org/terms-of-use" target="_blank" rel="noopener noreferrer nofollow">Terms of Use</a>
                <a href="https://commoncrawl.org/privacy-policy" target="_blank" rel="noopener noreferrer nofollow">Privacy</a>
            </div>
        </div>
    </div>
</footer>
        </body>
        </html>
"""

output_file = "../docs/index.html"
with open(output_file, "w") as file:
    file.write(html_content)
