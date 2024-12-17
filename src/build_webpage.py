import argparse
import datetime
import json
import markdown
import os
import pandas as pd
import subprocess
import warnings
from plotnine import ggplot, aes, geom_line, geom_point, theme, element_text, labs, scale_y_continuous, theme_minimal, scale_color_manual
from tqdm import tqdm


def fetch_top_entries(releases, file_type="host"):
    cache_dir = "cache/ranks"
    os.makedirs(cache_dir, exist_ok=True)
    release_entries = {}

    with tqdm(releases, desc=f"Fetching top {file_type}s", leave=False) as progress_bar:
        for release in progress_bar:
            cache_file = f"{cache_dir}/{release}-{file_type}-top-entries.txt"
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    lines = f.read().strip().split("\n")
                    release_entries[release] = [line.split() for line in lines]
            else:
                url = f"https://data.commoncrawl.org/projects/hyperlinkgraph/{release}/{file_type}/{release}-{file_type}-ranks.txt.gz"
                try:
                    result = subprocess.check_output(f"curl -s {url} | zcat | head -n 11", shell=True, text=True)
                    with open(cache_file, "w") as f:
                        f.write(result)
                    release_entries[release] = [line.split() for line in result.strip().split("\n")]
                except Exception as e:
                    print(f"Error fetching data for {release}: {e}")
                    release_entries[release] = []
    return release_entries


def has_comma_separated_values(series):
    return series.astype(str).str.contains(",").any()


def has_zero_signal(series):
    return series.nunique() <= 1


def generate_plots(data):
    plot_files = []
    colors = {
        "domain": "#f8766d",
        "host": "#1f77b4",
    }
    with tqdm(data.columns, desc="Checking for plots", leave=False, dynamic_ncols=True) as progress_bar:
        for col in progress_bar:
            if col not in ["release", "source"] and not has_comma_separated_values(data[col]) and not has_zero_signal(data[col]):
                file_name = f"{col}.png"
                file_path = f"../docs/plots/{file_name}"
                if args.no_plots and os.path.exists(file_path):
                    progress_bar.set_description(f"Using existing plot: {file_name}")
                    plot_files.append((col, file_name))
                else:
                    progress_bar.set_description(f"Generating plot: {file_name}")
                    plot = (
                        ggplot(data, aes(x='release', y=col, color='source'))
                        + geom_line(aes(group='source'))
                        + geom_point()
                        + theme_minimal()
                        + theme(
                            axis_text_x=element_text(angle=45, hjust=1),
                            panel_background=element_text(fill="white"),
                        )
                        + labs(title=f"{col}", x="Release", y=col)
                        + scale_y_continuous(labels=lambda l: [f'{v:.1e}' for v in l])
                        + scale_color_manual(values=colors)
                    )
                    plot.save(file_path, width=10, height=6, dpi=300)
                    plot_files.append((col, file_name))
    return plot_files


def embed_markdown_file(file_path, heading=''):
    try:
        with open(file_path, "r") as file:
            md_content = file.read()
        html_content = markdown.markdown(md_content)
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


warnings.filterwarnings("ignore", category=UserWarning, module="plotnine")

parser = argparse.ArgumentParser(description="Generate web statistics page")
parser.add_argument("--no-plots", action="store_true", help="Skip generating plots")
args = parser.parse_args()

descriptions_file = "attribute_descriptions.json"

with open(descriptions_file, "r") as file:
    descriptions = json.load(file)

domain_data = pd.read_csv("../docs/domain.tsv", sep="\t")
host_data = pd.read_csv("../docs/host.tsv", sep="\t")

domain_data['source'] = 'domain'
host_data['source'] = 'host'

combined_data = pd.concat([domain_data, host_data], ignore_index=True)

combined_data['release'] = pd.Categorical(
    combined_data['release'],
    ordered=False,
    categories=combined_data['release'].unique()
)

plot_files = generate_plots(combined_data)

last_updated = datetime.datetime.now().strftime("%Y-%m-%d")
latest_release = combined_data['release'].astype(str).max()
latest_release_url = f"https://data.commoncrawl.org/projects/hyperlinkgraph/{latest_release}/index.html"

html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Graph Statistics</title>
    <link rel="stylesheet" href="https://data.commoncrawl.org/static/bucket.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/default.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
    <script>hljs.highlightAll();</script>

    <meta property="og:title"  content="Common Crawl Web Graph Statistics">
    <meta name="twitter:title" content="Common Crawl Web Graph Statistics">
    <meta property="og:description"  content="Visualisations and metrics from the Common Crawl Web Graph dataset">
    <meta name="twitter:description" content="Visualisations and metrics from the Common Crawl Web Graph dataset">
    <meta property="og:image"  content="https://commoncrawl.github.io/cc-webgraph-statistics/img/masthead.jpg">
    <meta name="twitter:image" content="https://commoncrawl.github.io/cc-webgraph-statistics/img/masthead.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:url" content="https://commoncrawl.github.io/cc-webgraph-statistics/">
    <meta property="og:type" content="website">

    <style>
"""

html_content += embed_file('style.css')

html_content += """
    </style>
    <script>
        function setupDropdownHandlers() {
            const dropdowns = document.querySelectorAll('select[id$="-release-dropdown"]');
            dropdowns.forEach(dropdown => {
                dropdown.addEventListener('change', function () {
                    const group = this.id.split('-')[0];
                    const contents = document.querySelectorAll(`.dropdown-content[id^="dropdown-${group}"]`);
                    contents.forEach(content => content.classList.remove("active"));
                    const selected = this.value;
                    if (selected) {
                        document.getElementById(selected).classList.add("active");
                    }
                });
            });
        }
        document.addEventListener("DOMContentLoaded", setupDropdownHandlers);
    </script>
</head>
<body>
<h1>Web Graph Statistics</h1>
"""

html_content += f"""
<div class="update-info">
    <p><strong>Last Updated:</strong> {last_updated}</p>
    <p><strong>Latest Release:</strong> <a href="{latest_release_url}" target="_blank">{latest_release}</a></p>
</div>
"""

html_content += """
    <img class="full-width-image" src="img/masthead.webp" alt="decorative">
"""

html_content += embed_markdown_file("description.md", "Description")

html_content += '<h2>Top Ten Ranks</h2>'

for file_type in ['domain', 'host']:

    html_content += f'<span style="font-weight: bold">{file_type.capitalize()}</span>'
    html_content += f'<div class="dropdown">'
    html_content += f'<select id="{file_type}-release-dropdown">\n'
    html_content += '<option value="">Choose a release...</option>'

    releases = combined_data['release'].unique()
    release_entries = fetch_top_entries(releases, file_type)

    for release in reversed(releases):
        release_str = str(release)
        html_content += f'<option value="dropdown-{file_type}-{release_str}">{release_str}</option>\n'
    html_content += '</select>'
    html_content += '</div>'

    for release in releases:
        release_str = str(release)
        top_entries = release_entries[release_str]
        html_content += f'<div class="dropdown-content" id="dropdown-{file_type}-{release_str}">'
        if top_entries:
            html_content += '<table>\n'
            html_content += '<thead><tr>\n'
            html_content += ''.join(f'<th>{col}</th>\n' for col in top_entries[0])
            html_content += '</tr></thead>\n'
            html_content += '<tbody>\n'
            for row in top_entries[1:]:
                html_content += '<tr>' + ''.join(f'<td>{cell}</td>' for cell in row) + '</tr>\n'
            html_content += '</tbody></table>\n'
        else:
            html_content += '<p>No data available.</p>\n'
        html_content += '</div>\n'

releases = combined_data['release'].unique()
release_entries = fetch_top_entries(releases, 'domain')

for release in releases:
    release_str = str(release)
    top_entries = release_entries[release_str]
    html_content += f'<div class="dropdown-content" id="dropdown-{release_str}">\n'
    if top_entries:
        html_content += '<table>\n'
        html_content += '<thead><tr>\n'
        html_content += ''.join(f'<th>{col}</th>\n' for col in top_entries[0])
        html_content += '</tr></thead>\n'
        html_content += '<tbody>\n'
        for row in top_entries[1:]:
            html_content += '<tr>' + ''.join(f'<td>{cell}</td>' for cell in row) + '</tr>\n'
        html_content += '</tbody></table>\n'
    else:
        html_content += '<p>No data available.</p>\n'
    html_content += '</div>\n'

html_content += "<p>These ranks can be found by running the following:</p>"

html_content += """<pre><code class="bash"># Define environment variables for release and graph level
export RELEASE="{release}"  # Desired release (e.g., cc-main-2017-18-nov-dec-jan)
export GRAPH_LEVEL="{graph_level}"  # Desired graph level (e.g., domain or host)

# Fetch the top 10 ranks for the specified release and graph level
curl -s https://data.commoncrawl.org/projects/hyperlinkgraph/$RELEASE/ \\
        $GRAPH_LEVEL/$RELEASE-$GRAPH_LEVEL-ranks.txt.gz \\
        | zcat \\
        | head -n 11
</code></pre>"""

html_content += "<p>Each of these ranks files is multiple GiB, so piping to <code>zcat</code> or <code>gunzip</code> allows you to use <code>head</code> or <code>tail</code> to avoid downloading the whole thing.</p>\n"

html_content += '<div><h4>What Are These Ranks?</h4>\n'

html_content += "<p><a href='https://en.wikipedia.org/wiki/Centrality' target='_blank'>Harmonic Centrality</a> (that's the equation below and on the <i>left</i>) considers how close a node is to others, directly or indirectly. The closer a node is to others, the higher its score. It's based on proximity, not the importance or behaviour of neighbours. We calculate this with <a href='https://webgraph.di.unimi.it/docs/it/unimi/dsi/webgraph/algo/HyperBall.html' target='_blank'>HyperBall</a>.</p>\n"

html_content += """<div class="latex">
  <img src="img/harmcen.svg" alt="Harmonic Centrality equation">
  <img src="img/pagerank.svg" alt="PageRank equation">
</div>
"""

html_content += "<p>With <a href ='https://en.wikipedia.org/wiki/PageRank' target='_blank'>PageRank</a> (that's the equation on the <i>right</i>), each node's score depends on how many important nodes link to it, and how those nodes distribute their importance.  We calculate this with <a href='https://law.di.unimi.it/software/law-docs/it/unimi/dsi/law/rank/PageRankParallelGaussSeidel.html' target='_blank'>PageRankParallelGaussSeidel</a>.</p>\n"

html_content += "<p>PageRank is susceptible to manipulation (e.g., link farming or creating many interconnected spam pages). These artificial links can inflate the importance of a spam node. Harmonic Centrality is better for reducing this spam, because it's harder to 'game', or exploit through artificial link patterns.</p></div>\n"

html_content += '<h2>Statistics Plots</h2>\n'

html_content += '<div class="toc">\n<ul>\n'

for col in descriptions.keys():
    html_content += f'<li><a href="#{col}">{col}</a></li>\n'
html_content += '</ul>\n</div>\n'

html_content += '<p>The following plots are of Web Graph <a href="https://webgraph.di.unimi.it/docs/it/unimi/dsi/webgraph/Stats.html" target="_blank">statistics</a> for all previous releases.</p>\n'

html_content += '<div class="download"><h2>Download Data</h2>\n'
html_content += '<a href="domain.tsv" download class="download-button"><i class="fas fa-download"></i>domain.tsv</a>\n'
html_content += '<a href="host.tsv" download class="download-button"><i class="fas fa-download"></i>host.tsv</a>\n'
html_content += '</div>\n'

for col in descriptions.keys():
    file_name = f"{col}.png"
    file_path = f"../docs/plots/{file_name}"
    description = descriptions.get(col, "No description available.")
    if os.path.exists(file_path):
        html_content += f"""
        <div class="chart-container">
            <h4 id="{col}">
                <a href="#{col}">{col}</a>
            </h4>
            <a href="./plots/{file_name}" target="_blank">
                <img src="./plots/{file_name}" alt="{col} Plot">
            </a>
            <p>{description}</p>
        </div>
        """
    else:
        html_content += f"""
        <div class="chart-container">
            <h4 id="{col}">
                <a href="#{col}">{col}</a>
            </h4>
            <p><i>No plot available for this attribute.</i></p>
            <p>{description}</p>
        </div>
        """

html_content += """
            <div>
                <h3 id='related-reading'><a href="#related-reading">Related Reading</a></h3>
                <ul>
                    <li>
                        <a href='https://arxiv.org/pdf/2012.01946'>Can I Take Your Subdomain? Exploring Related-Domain Attacks in the Modern Web</a>
                    </li>
                    <li>
                        <a href='https://arxiv.org/abs/1802.05435'>Analysis of the Web Graph Aggregated by Host and Pay-Level Domain</a>
                    </li>
                </ul>
            </div>
            <div>
                <h3>Credits</h3>
                <ul>
                    <li>
                        <a href="http://webdatacommons.org/" target="_blank">Web Data Commons</a>, for their web graph data set and everything related.
                    </li>
                    <li>
                        <a href="https://about.commonsearch.org/" target="_blank">Common Search</a>; we first used their web graph to expand the crawler frontier, and Common Search's <a href="https://github.com/commonsearch/cosr-back/" target="_blank">cosr-back</a> project was an important source of inspiration how to process our data using PySpark.
                    </li>
                    <li>
                        The authors of the <a href="https://webgraph.di.unimi.it/" target="_blank">WebGraph framework</a>, whose software simplifies the computation of rankings.
                    </li>
                </ul>
            </div>
            <a href="#">Back to Top...</a>
            <footer>
                <hr>
                <p>
                    <a href="https://commoncrawl.org/">Common Crawl</a> is a California 501(c)(3) registered non-profit organization.
                    Hosting of <a href="https://commoncrawl.org/the-data/">Common Crawl data</a> is covered by
                    <a href="https://aws.amazon.com/opendata/open-data-sponsorship-program/">Amazon Web Services' Open Data Sponsorship Program</a>.
                </p>
                <p>
                    <a href="https://commoncrawl.org/terms-of-use" target="_blank">Terms of Use</a>
                    <a href="https://commoncrawl.org/privacy-policy" target="_blank">Privacy</a>
                </p>
            </footer>
        </body>
        </html>
"""

output_file = "../docs/index.html"
with open(output_file, "w") as file:
    file.write(html_content)

# print(f"Page generated: {output_file}")
